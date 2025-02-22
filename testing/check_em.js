import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { createReadStream, writeFileSync, readFileSync } from 'fs';
import csv from 'csv-parser';
import readline from 'readline';

async function generateTextEmbedding(text) {
    try {
        const api_key = "SG_e5f1bb1f74c02a63";
        const url = "https://api.segmind.com/v1/text-embedding-3-small";
        const data = {
            "prompt": text
        };

        const response = await axios.post(url, data, {
            headers: { 'x-api-key': api_key }
        });

        return response.data.embedding;

    } catch (error) {
        console.error('Error generating text embedding:', error);
        throw error;
    }
}

async function generateBatchTextEmbeddings(texts) {
    const tokenizer = await AutoTokenizer.from_pretrained("Xenova/all-MiniLM-L6-v2");
    const textModel = await AutoModel.from_pretrained("Xenova/all-MiniLM-L6-v2");

    const normalizedTexts = texts.map(text => `${text}`.toLowerCase().trim());
    const textInputs = await tokenizer(normalizedTexts, {
        padding: true,
        truncation: true,
        max_length: 128,
        return_tensors: 'pt'
    });

    const textOutput = await textModel(textInputs);
    const tokenTensor = textOutput.last_hidden_state;

    // Perform pooling for each item in the batch
    const pooledEmbeddings = [];
    for (let b = 0; b < texts.length; b++) {
        const pooled = meanPooling(tokenTensor, textInputs.attention_mask, b);
        pooledEmbeddings.push(pooled);
    }

    return pooledEmbeddings;
}

function cosineSimilarity(vecA, vecB) {
    if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length !== vecB.length) {
        return 0; // Return 0 similarity for invalid inputs
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
        // Ensure we're working with valid numbers
        const a = Number(vecA[i]);
        const b = Number(vecB[i]);

        if (isNaN(a) || isNaN(b)) {
            continue; // Skip invalid numbers
        }

        dotProduct += a * b;
        normA += a * a;
        normB += b * b;
    }

    // Avoid division by zero
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) {
        return 0;
    }

    const similarity = dotProduct / denominator;
    return isNaN(similarity) ? 0 : similarity;
}

// Retrieve similar products based on text query
async function retrieveSimilarProducts(query, topK = 5) {
    try {
        // Generate embedding for the query
        const queryEmbedding = await generateTextEmbedding(query);

        // Load stored embeddings and products
        const storedEmbeddings = JSON.parse(readFileSync('text_embedding.json', 'utf8'));
        const products = [];
        await new Promise((resolve, reject) => {
            createReadStream('product.csv')
                .pipe(csv())
                .on('data', (row) => products.push(row))
                .on('end', resolve)
                .on('error', reject);
        });

        // Calculate similarities
        const similarities = storedEmbeddings.map((embedding, index) => ({
            product: products[index],
            similarity: cosineSimilarity(queryEmbedding, embedding)
        }));

        // Sort by similarity and get top K results
        return similarities
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, topK);
    } catch (error) {
        console.error('Error retrieving similar products:', error);
        throw error;
    }
}


async function generateImageEmbedding(imageUrl) {
    try {
        // console.log("Starting image embedding process...");

        // Load processor and vision model without quantization.
        const imageProcessor = await AutoProcessor.from_pretrained("Xenova/clip-vit-base-patch32");
        const visionModel = await CLIPVisionModelWithProjection.from_pretrained("Xenova/clip-vit-base-patch32");
        // console.log("Models loaded successfully");

        // Fetch the image from the URL.
        // console.log("Fetching image...");
        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.statusText}`);
        }
        const imageBlob = await response.blob();
        // console.log("Image fetched successfully");

        // Process the image.
        let image = await RawImage.fromBlob(imageBlob);
        let imageInputs = await imageProcessor(image);
        // console.log("Processed image dimensions:",
        //   imageInputs.pixel_values[0].dims[1], // height
        //   imageInputs.pixel_values[0].dims[2]  // width
        // );

        // Get the image embeddings.
        let { image_embeds } = await visionModel(imageInputs);
        const embeddings = Array.from(image_embeds.data);
        // console.log("Image processing completed");
        // console.log("Embedding dimension:", embeddings.length);

        if (embeddings.length === 0) {
            throw new Error("Generated embeddings are empty");
        }
        if (embeddings.some(val => typeof val !== 'number' || isNaN(val))) {
            throw new Error("Generated embeddings contain invalid values");
        }

        // console.log("Embeddings validation passed");
        return embeddings;
    } catch (error) {
        console.error("Error in generateImageEmbedding:", error);
        throw error;
    }
}

async function processProducts() {
    try {
        const products = [];
        const textEmbeddings = [];

        // Read CSV file.
        await new Promise((resolve, reject) => {
            createReadStream('product.csv')
                .pipe(csv())
                .on('data', (row) => {
                    products.push(row);
                })
                .on('end', resolve)
                .on('error', reject);
        });

        // Process each product.
        for (const product of products) {
            try {
                // console.log(`Processing product: ${product.title}`);

                // Combine title, description, and price similar to Python implementation.
                const combinedText = `${product.title} ${product.description} ${product.price}`;
                const textEmbedding = await generateTextEmbedding(combinedText);
                // console.log('Text Embedding:', textEmbedding);
                textEmbeddings.push(textEmbedding);
                // console.log('Text Embedding Dimension:', textEmbedding.length);

                // Generate image embedding but don't save it
                // console.log("Processing image:", product.image);
                // await generateImageEmbedding(product.image);

                // console.log(`Successfully processed image and text for: ${product.title}`);
            } catch (error) {
                console.error(`Error processing product ${product.title}:`, error);
            }
        }

        // Save only text embeddings to a JSON file
        writeFileSync('text_embedding.json', JSON.stringify(textEmbeddings, null, 2));
        // console.log('Text embeddings saved to text_embedding.json');
        // console.log('All products processed successfully');

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const askQuery = () => {
            rl.question('Enter your search query (or type "exit" to quit): ', async (query) => {
                if (query.toLowerCase() === 'exit') {
                    rl.close();
                    return;
                }

                const similarProducts = await retrieveSimilarProducts(query, 3);
                console.log(`\nTop 3 products similar to "${query}":`);
                similarProducts.forEach((result, index) => {
                    console.log(`\n${index + 1}. ${result.product.title}`);
                    console.log(`   Similarity: ${result.similarity.toFixed(4)}`);
                    console.log(`   Description: ${result.product.description}`);
                    console.log(`   Price: ${result.product.price}`);
                });

                askQuery(); // Ask for another query
            });
        };

        askQuery();

    } catch (error) {
        console.error('Error processing products:', error);
        throw error;
    }
}

// Run the product processing.
processProducts();
