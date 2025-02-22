import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import axios from 'axios';
import readline from 'readline';
import https from 'https';

const embeddings = {
    embedQuery: async (text) => {
        const data = JSON.stringify({
            model: 'jina-clip-v2',
            dimensions: 1024,
            normalized: true,
            embedding_type: 'float',
            input: [
                { text: text }
            ]
        });

        const options = {
            hostname: 'api.jina.ai',
            port: 443,
            path: '/v1/embeddings',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer jina_7315941fbe6e4b639916e016884d24cf6Mjf2ug0y35gxbxLQgir76wP4gA3'
            }
        };

       return new Promise((resolve, reject) => {
            const req = https.request(options, res => {
                let responseData = '';

                res.on('data', chunk => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    try {
                        const parsedData = JSON.parse(responseData);
                        const embedding = parsedData.data[0].embedding;
                        console.log(`Embedding dimension length: ${embedding.length}`);
                        resolve(embedding);
                    } catch (error) {
                        reject(error);
                    }
                });
            });

            req.on('error', error => {
                reject(error);
            });

            req.write(data);
            req.end();
        });
    }
};

// Initialize PostgreSQL vector store config
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
        contentColumnName: "title", // Using title as the main content
        descriptionColumnName: "description", // Add description column
        priceColumnName: "price", // Add price column
    },
    distanceStrategy: "cosine",
};



async function processProducts(queryText) {
    try {
        // Initialize vector store
        const vectorStore = await PGVectorStore.initialize(embeddings, config);

        // Search for similar products
        const results = await vectorStore.similaritySearchWithScore(queryText, 5);
        
        console.log("Search results:");
        results.forEach((result, i) => {
            console.log(result);
        });

    } catch (error) {
        console.error('Error processing products:', error);
        throw error;
    }
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.question('Enter your search query: ', async (query) => {
    await processProducts(query);
    rl.close();
});
