import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { Document } from "@langchain/core/documents";
import { AutoProcessor, CLIPVisionModelWithProjection, pipeline, RawImage } from "@xenova/transformers";
import * as fs from "fs";
import { configDotenv } from "dotenv";
configDotenv();
import pkg from 'pg';
const { Pool } = pkg;

let featureExtractor, client;

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'chat_bot',
    password: '1234',
    port: 5432,
});

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

async function findSimilarImagesWithFaiss(queryImagePath) {
    try {
        client = await pool.connect();

        const embedding = await generateImageEmbedding(queryImagePath);
        console.log(embedding);
        
    } catch (error) {
        console.error("Error finding similar images:", error);
        throw error;
    } finally {
        if (client) {
            await client.release();
        }
    }
}

async function main() {
    try {
        const similarImages = await findSimilarImagesWithFaiss("./public/temp_1739606461780.jpg");
        console.log("Similar images:", similarImages);
    } catch (error) {
        console.error("Error in main:", error);
    }
}

main();