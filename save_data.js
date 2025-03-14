import {
    CLIPVisionModelWithProjection,
    RawImage,
    AutoProcessor,
    AutoTokenizer,
    AutoModel
} from "@xenova/transformers";
import { createReadStream, writeFileSync, readFileSync } from 'fs';
import csv from 'csv-parser';
import readline from 'readline';
import https from "https";
import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import pkg from 'pg';
const { PoolConfig, Pool } = pkg;



async function generateTextEmbedding(text) {
    try {
        // Load tokenizer and model without quantization for full-precision outputs.
        const tokenizer = await AutoTokenizer.from_pretrained("Xenova/paraphrase-multilingual-MiniLM-L12-v2", { quantized: true });
        const textModel = await AutoModel.from_pretrained("Xenova/paraphrase-multilingual-MiniLM-L12-v2", { quantized: true });

        // Preprocess text (lowercase and trim whitespace)
        const normalizedText = `${text}`.toLowerCase().trim();

        // Tokenize the text and request tensor outputs.
        const textInputs = await tokenizer(normalizedText, {
            padding: true,
            truncation: true,
            max_length: 128,
            return_tensors: 'pt'
        });

        // Run the model.
        const textOutput = await textModel(textInputs);

        // Access the token embeddings tensor.
        const tokenTensor = textOutput.last_hidden_state;
        // Use dims property to get dimensions (assume dims is an array of numbers)
        const dims = tokenTensor.dims; // For example, [1, seqLen, hiddenSize]
        const [batchSize, seqLen, hiddenSize] = dims;

        // Get the attention mask values.
        const attentionMask = textInputs.attention_mask.data; // flat array [batchSize * seqLen]

        // Weighted mean pooling using the attention mask.
        const pooledEmbeddings = [];
        for (let b = 0; b < batchSize; b++) {
            let sumTokens = 0;
            const pooled = new Array(hiddenSize).fill(0);
            for (let t = 0; t < seqLen; t++) {
                // Each token's mask value (usually 1 for valid tokens, 0 for padding)
                const maskValue = Number(attentionMask[b * seqLen + t]);
                sumTokens += maskValue;
                for (let h = 0; h < hiddenSize; h++) {
                    // Calculate index into the flattened tensor data array.
                    const index = b * seqLen * hiddenSize + t * hiddenSize + h;
                    // Convert tokenTensor.data[index] explicitly to a number.
                    pooled[h] += Number(tokenTensor.data[index]) * maskValue;
                }
            }
            // Divide by the sum of mask values (i.e. number of valid tokens).
            if (sumTokens > 0) {
                for (let h = 0; h < hiddenSize; h++) {
                    pooled[h] /= sumTokens;
                }
            }
            pooledEmbeddings.push(pooled);
        }

        // Return the pooled embedding for the first (and only) batch.
        return pooledEmbeddings[0];
    } catch (error) {
        console.error('Error generating text embedding:', error);
        throw error;
    }
}

const config = {
    postgresConnectionOptions: {
        type: "postgres",
        host: "localhost",
        port: 5432,
        user: "postgres",
        password: "1234",
        database: "chat_bot",
    },
    tableName: "products",
    columns: {
        idColumnName: "id",
        vectorColumnName: "text_embedding",
        contentColumnName: "title",
        metadataColumnName: "metadata",
        descriptionColumnName: "description",
        priceColumnName: "price",
    },
    distanceStrategy: "cosine",
};

const embeddings = {
    embedDocuments: async (texts) => {
        const data = JSON.stringify({
            model: "jina-clip-v2",
            dimensions: 1024,
            normalized: true,
            embedding_type: "float",
            input: texts.map((text) => ({ text })),
        });

        const options = {
            hostname: "api.jina.ai",
            port: 443,
            path: "/v1/embeddings",
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer jina_7315941fbe6e4b639916e016884d24cf6Mjf2ug0y35gxbxLQgir76wP4gA3",
            },
        };

        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let responseData = "";

                res.on("data", (chunk) => {
                    responseData += chunk;
                });

                res.on("end", () => {
                    try {
                        const parsedData = JSON.parse(responseData);
                        const embeddings = parsedData.data.map((item) => item.embedding);
                        console.log(`Processed ${embeddings.length} embeddings`);
                        resolve(embeddings);
                    } catch (error) {
                        reject(error);
                    }
                });
            });

            req.on("error", (error) => {
                reject(error);
            });

            req.write(data);
            req.end();
        });
    },
    embedQuery: async (text) => {
        const data = JSON.stringify({
            model: "jina-clip-v2",
            dimensions: 1024,
            normalized: true,
            embedding_type: "float",
            input: [{ text }],
        });

        const options = {
            hostname: "api.jina.ai",
            port: 443,
            path: "/v1/embeddings",
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer jina_7315941fbe6e4b639916e016884d24cf6Mjf2ug0y35gxbxLQgir76wP4gA3",
            },
        };

        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let responseData = "";

                res.on("data", (chunk) => {
                    responseData += chunk;
                });

                res.on("end", () => {
                    try {
                        const parsedData = JSON.parse(responseData);
                        const embedding = parsedData.data[0].embedding;
                        console.log("Processed query embedding");
                        resolve(embedding);
                    } catch (error) {
                        reject(error);
                    }
                });
            });

            req.on("error", (error) => {
                reject(error);
            });

            req.write(data);
            req.end();
        });
    }
};

const vectorStore = await PGVectorStore.initialize(embeddings, config);

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

        // console.log("Embeddings validation passed",embeddings);
        return embeddings;
    } catch (error) {
        console.error("Error in generateImageEmbedding:", error);
        throw error;
    }
}

const pool = new Pool({
    host: "localhost",
    port: 5432,
    user: "postgres",
    password: "1234",
    database: "chat_bot",
});

const client = await pool.connect();

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
                const combinedText = `${product.title} ${product.description} ${product.price}`;
                
                console.log("Processing image:", product.image);
                const imageEmbedding = await generateImageEmbedding(product.image);

                
                const document = {
                    pageContent: combinedText,
                    metadata: {
                        title: product.title,
                        description: product.description,
                        price: product.price,
                        image: product.image,
                        image2: product.image2,
                        image_embedding: imageEmbedding
                    },
                }

                
                await vectorStore.addDocuments([document]);
                
                const sqlQuery = `UPDATE products SET price = CAST(metadata->>'price' AS double precision) WHERE price IS null`;
                await client.query(sqlQuery);
                
            } catch (error) {
                console.error(`Error processing product ${product.title}:`, error);
            }
        }

    } catch (error) {
        console.error('Error processing products:', error);
        throw error;
    }
}

// Run the product processing.
processProducts();