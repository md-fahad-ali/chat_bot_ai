import { AutoProcessor, CLIPVisionModelWithProjection, pipeline, RawImage } from "@xenova/transformers";
import * as fs from "fs";
import { configDotenv } from "dotenv";
configDotenv();
import pkg from 'pg';
const { Pool } = pkg;
import Groq from "groq-sdk";


let featureExtractor, client, db;

configDotenv();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'chat_bot',
  password: '1234',
  port: 5432,
});

// Generate image embedding from image path or url
async function generateImageEmbedding(imageSource) {
  try {
    // Load processor and vision model without quantization.
    const imageProcessor = await AutoProcessor.from_pretrained("Xenova/clip-vit-base-patch32");
    const visionModel = await CLIPVisionModelWithProjection.from_pretrained("Xenova/clip-vit-base-patch32");

    let image;
    if (imageSource.startsWith('http')) {
      // Handle URL case
      const response = await fetch(imageSource);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      const imageBlob = await response.blob();
      image = await RawImage.fromBlob(imageBlob);
    } else {
      // Handle file path case
      const imageBuffer = fs.readFileSync(imageSource);
      const blob = new Blob([imageBuffer]);
      image = await RawImage.fromBlob(blob);
    }

    // Process the image
    let imageInputs = await imageProcessor(image);

    // Get the image embeddings
    let { image_embeds } = await visionModel(imageInputs);
    const embeddings = Array.from(image_embeds.data);

    if (embeddings.length === 0) {
      throw new Error("Generated embeddings are empty");
    }
    if (embeddings.some(val => typeof val !== 'number' || isNaN(val))) {
      throw new Error("Generated embeddings contain invalid values");
    }

    return embeddings;
  } catch (error) {
    console.error("Error in generateImageEmbedding:", error);
    throw error;
  }
}

// Function to find similar images using pgvector
async function findSimilarImages(embedding, limit = 5) {
  const query = `
    SELECT p.id, p.metadata->>'title' as title , p.metadata->>'description' as description, p.price, p.metadata->>'image' as image, 
    (p.metadata->>'image_embedding')::vector <-> $1::vector AS distance 
    FROM products p
    ORDER BY distance ASC
    LIMIT $2;
  `;
  
  const result = await client.query(query, [`[${embedding.join(',')}]`, limit]);   
  // console.log(result.rows);
  // console.log(`[${embedding.join(',')}]`);
  return result.rows;
}

export const searchProductsImage = async (req, res) => {
  let tempPath;
  try {
    // Initialize feature extractor
    featureExtractor = await pipeline(
      "image-feature-extraction",
      "Xenova/clip-vit-base-patch32"
    );

    client = await pool.connect();

    const image = req.file;
    const imageBuffer = image.buffer;
    const imageName = image.originalname;
    tempPath = `./public/temp_${Date.now()}.jpg`;
    fs.writeFileSync(tempPath, imageBuffer);

    // Generate embeddings for the uploaded image
    const imageFeatures = await generateImageEmbedding(tempPath);

    // Find similar images using pgvector
    const similarImages = await findSimilarImages(imageFeatures);

    // console.log("Similar images found:", similarImages);

    // Clean up the temporary file
    if (tempPath) {
      fs.unlinkSync(tempPath);
    }

    return { 
      similarImages
    };

  } catch (error) {
    console.error("Initialization failed:", error);
    if (tempPath) {
      try {
        fs.unlinkSync(tempPath);
      } catch (unlinkError) {
        console.error("Error cleaning up temporary file:", unlinkError);
      }
    }
    return { success: false, error: error.message };
  } finally {
    if (client) {
      client.release();
    }
  }
}