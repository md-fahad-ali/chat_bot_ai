import {
  CLIPVisionModelWithProjection,
  RawImage,
  AutoProcessor,
  AutoTokenizer,
  AutoModel
} from "@xenova/transformers";
import { createReadStream } from 'fs';
import csv from 'csv-parser';

async function generateTextEmbedding(text) {
  try {
    // Initialize all-MiniLM model
    const tokenizer = await AutoTokenizer.from_pretrained(
      "Xenova/all-MiniLM-L6-v2"
    );
    const textModel = await AutoModel.from_pretrained(
      "Xenova/all-MiniLM-L6-v2",
      { quantized: true }
    );

    // Normalize and combine text
    const normalizedText = `${text}`.toLowerCase().trim();

    // Generate embedding
    const textInputs = await tokenizer(normalizedText, {
      padding: true,
      truncation: true,
      max_length: 128,
      return_tensors: 'pt'
    });
    const textOutput = await textModel(textInputs);

    // Mean pooling
    const meanPooling = Array.from(textOutput.last_hidden_state.data)
      .reduce((acc, val, i) => {
        const idx = Math.floor(i / 384);
        if (!acc[idx]) acc[idx] = [];
        acc[idx].push(val);
        return acc;
      }, [])
      .map(arr => arr.reduce((sum, val) => sum + val, 0) / arr.length);

    return meanPooling;
  } catch (error) {
    console.error('Error generating text embedding:', error);
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

    // Print the actual embedding data
    // console.log("Embedding data:", embeddings);

    // Verify embeddings are non-empty and contain valid numbers
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
        
        // Generate text embedding
        const combinedText = `${product.title} ${product.description} ${product.price}`;
        const textEmbedding = await generateTextEmbedding(combinedText);
        // console.log('Text embedding:', textEmbedding); // Commented out embedding data
        console.log('Text Dimension:', textEmbedding.length);

        // Generate image embedding
        console.log("Processing image:", product.image);
        const embedding = await generateImageEmbedding(product.image);
        console.log("Image Dimension:", embedding.length);
        
        console.log(`Successfully processed image and text for: ${product.title}`);
      } catch (error) {
        console.error(`Error processing product ${product.title}:`, error);
      }
    }

    console.log('All products processed successfully');
  } catch (error) {
    console.error('Error processing products:', error);
    throw error;
  }
}

// Run the processing
processProducts();
