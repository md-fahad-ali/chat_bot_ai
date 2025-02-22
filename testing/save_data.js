import {
  CLIPVisionModelWithProjection,
  RawImage,
  AutoProcessor,
  AutoTokenizer,
  AutoModel
} from "@xenova/transformers";
import { createReadStream } from 'fs';
import csv from 'csv-parser';
import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import pkg from 'pg';
const { PoolConfig, Pool } = pkg;

import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";

// Database configuration
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'chat_bot',
  password: '1234',
  port: 5432,
});

async function generateTextEmbedding(text) {
  try {
    // Preprocess the text
    const normalizedText = text
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' '); // Normalize whitespace

    // Generate embedding with error checking
    const embeddings = await model.embedQuery(normalizedText);
    
    // Validate embedding
    if (!embeddings || embeddings.length !== 384) { // MiniLM outputs 384 dimensions
      throw new Error(`Invalid embedding dimension: ${embeddings?.length}`);
    }

    // Check for NaN or invalid values
    if (embeddings.some(val => typeof val !== 'number' || isNaN(val))) {
      throw new Error('Embedding contains invalid values');
    }

    // Normalize the embedding vector (L2 normalization)
    const magnitude = Math.sqrt(embeddings.reduce((sum, val) => sum + val * val, 0));
    const normalizedEmbedding = embeddings.map(val => val / magnitude);

    // Log for debugging
    console.log('Text:', normalizedText.substring(0, 100) + '...');
    console.log('Embedding dimension:', normalizedEmbedding.length);
    console.log('First 5 values:', normalizedEmbedding.slice(0, 5));
    console.log('Magnitude after normalization:', 
      Math.sqrt(normalizedEmbedding.reduce((sum, val) => sum + val * val, 0))
    );

    return normalizedEmbedding;
  } catch (error) {
    console.error('Error in generateTextEmbedding:', error);
    throw error;
  }
}

async function generateImageEmbedding(imageUrl) {
  try {
    console.log("Starting image embedding process...");

    // Initialize the model and processor
    console.log("Loading models...");
    const imageProcessor = await AutoProcessor.from_pretrained(
      "Xenova/clip-vit-base-patch32",
      { quantized: true }
    );
    const visionModel = await CLIPVisionModelWithProjection.from_pretrained(
      "Xenova/clip-vit-base-patch32",
      { quantized: true }
    );
    console.log("Models loaded successfully");

    // Fetch the image
    console.log("Fetching image...");
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    const imageBlob = await response.blob();
    console.log("Image fetched successfully");

    // Process the image
    console.log("Processing image...");
    console.log("Image processed successfully", imageBlob);
    let image = await RawImage.fromBlob(imageBlob);
    let imageInputs = await imageProcessor(image);

    // Add this to verify processing dimensions (optional)
    console.log("Processed image dimensions:",
      imageInputs.pixel_values[0].dims[1], // height
      imageInputs.pixel_values[0].dims[2]  // width
    );

    let { image_embeds } = await visionModel(imageInputs);

    // Convert embeddings to regular array
    const embeddings = Array.from(image_embeds.data);
    console.log("Image processing completed");
    console.log("Embedding dimension:", embeddings.length);

    if (embeddings.length === 0) {
      throw new Error("Generated embeddings are empty");
    }

    if (embeddings.some(val => typeof val !== 'number' || isNaN(val))) {
      throw new Error("Generated embeddings contain invalid values");
    }

    console.log("Embeddings validation passed");
    return embeddings;
  } catch (error) {
    console.error("Error in generateImageEmbedding:", error);
    throw error;
  }
}

async function processProducts() {
  const client = await pool.connect();
  try {
    const products = [];

    // Read CSV file
    await new Promise((resolve, reject) => {
      createReadStream('product.csv')
        .pipe(csv())
        .on('data', (row) => {
          products.push(row);
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // Process each product
    for (const product of products) {
      try {
        console.log(`Processing product: ${product.title}`);
        
        // Combine text fields with proper weighting
        const combinedText = [
          product.title,
          product.description,
          product.price.toString()
        ].join(' ');

        // Generate and validate embedding
        const textEmbedding = await generateTextEmbedding(combinedText);

        // Insert into database
        const query = `
          INSERT INTO products (
            title, 
            description, 
            price, 
            image_url,
            image_url2,
            text_embedding
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `;

        await client.query(query, [
          product.title,
          product.description,
          product.price,
          product.image,
          product.image2 || null,
          `[${textEmbedding.join(',')}]`  // Properly format for pgvector
        ]);
        
        console.log(`Successfully processed: ${product.title}`);
      } catch (error) {
        console.error(`Error processing product ${product.title}:`, error);
      }
    }

    console.log('All products processed');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the processing
processProducts().catch(console.error);
