import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import https from "https";
import { createReadStream } from "fs";
import csv from "csv-parser";

// Embeddings configuration
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

// PostgreSQL vector store configuration
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

const vectorStore = await PGVectorStore.initialize(embeddings, config);

// Function to process products
async function processProducts() {
    try {
        const products = [];
        await new Promise((resolve, reject) => {
            createReadStream("product.csv")
                .pipe(csv())
                .on("data", (row) => {
                    // Ensure price and description are valid
                    const price = parseFloat(row.price);
                    row.price = isNaN(price) ? 0 : price;
                    row.description = row.description || "";

                    products.push(row);
                })
                .on("end", resolve)
                .on("error", reject);
        });

        for (const product of products) {
            try {
                console.log("Processing product:", {
                    title: product.title,
                    description: product.description,
                    price: product.price,
                });

                // Create document with proper metadata
                const document = {
                    pageContent: `${product.title} ${product.description}`,
                    metadata: {
                        title: product.title,
                        description: product.description,
                        price: product.price,
                    },
                };

                // First generate embeddings manually
                const embeddings = await embeddings.embedDocuments([document.pageContent]);
                
                // Then add to vector store with embeddings
                await vectorStore.addVectors(embeddings, [document], {
                    additionalFields: {
                        description: product.description,
                        price: product.price,
                    },
                });

                console.log(`Successfully processed product: ${product.title}`);
            } catch (error) {
                console.error(`Error processing product ${product.title}:`, error);
            }
        }
    } catch (error) {
        console.error("Error processing products:", error);
    }
}

async function retrive_data(query) {
    try {
        let minPrice = 0;
        let maxPrice = Number.MAX_VALUE;
        
        // Remove price-related words from the search query
        let searchQuery = query;
        if (query.includes('less than') || query.includes('cheaper than')) {
            const priceMatch = query.match(/less than|cheaper than\s*(\d+)/i);
            if (priceMatch) {
                maxPrice = parseFloat(priceMatch[1]);
                // Remove price-related terms from search query
                searchQuery = query.replace(/less than|cheaper than\s*(\d+)\s*dollars?/i, '').trim();
            }
        }
        
        if (query.includes('more than') || query.includes('greater than')) {
            const priceMatch = query.match(/more than|greater than\s*(\d+)/i);
            if (priceMatch) {
                minPrice = parseFloat(priceMatch[1]);
                // Remove price-related terms from search query
                searchQuery = query.replace(/more than|greater than\s*(\d+)\s*dollars?/i, '').trim();
            }
        }

        // Increase number of results to 5 for better matching
        const results = await vectorStore.similaritySearch(searchQuery, 5, {
            filter: {
                price: {
                    gte: minPrice,
                    lte: maxPrice
                }
            }
        });
        
        if (results.length === 0) {
            console.log("No products found matching your criteria.");
            return;
        }

        console.log("Found the following products:");
        for (const doc of results) {
            console.log("\nProduct:", doc.metadata.title);
            console.log("Price: $", doc.metadata.price);
            console.log("Description:", doc.metadata.description);
        }
    } catch (error) {
        console.error("Error retrieving data:", error);
    }
}

// Example usage:
// retrive_data("show me products less than 100 dollars");
// retrive_data("find products cheaper than 50 dollars");
// retrive_data("show me products more than 1000 dollars");

// Start processing
processProducts();
retrive_data("show me products greater than 100 dollars");
