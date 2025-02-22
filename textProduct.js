import Groq from "groq-sdk";
import dotenv from "dotenv";
import pkg from 'pg';
const { Pool } = pkg;
import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import https from "https";

dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'chat_bot',
    password: '1234',
    port: 5432,
});

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



async function generateSQLQuery(userInput) {
    console.log("userInput", userInput);
    const currentDateTime = "2025-02-07 12:44:34";
    const currentUser = "md-fahad-ali";

    //print the all tabless column chat_bot tables and types from the database from the query 
    const tables = await pool.query(`SELECT table_name, column_name, data_type 
                                    FROM information_schema.columns 
                                    WHERE table_schema = 'public'
                                    ORDER BY table_name, ordinal_position;
    `);
    console.log("tables row", tables.rows);
    //how can i show that tables.row to the ai to undertand and make the table
    const tableString = tables.rows.map(row => `${row.table_name} - ${row.column_name}: ${row.data_type}`).join('\n');
    console.log("tableString", tableString);



    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const completion = await groq.chat.completions.create({
        messages: [
            {
                role: "system",
                content: `You are a SQL query generator. You must ONLY respond with valid SQL queries.
                 Current timestamp: ${currentDateTime}
                 Current user: ${currentUser}
                 Rules:
                 - ONLY output valid SQL queries
                 - Do not provide explanations
                 - Do not include markdown or code blocks
                 - For product search queries like "show me X" or "give me X", convert them into a search query like "SELECT * FROM products WHERE title ILIKE '%X%' OR description ILIKE '%X%'"
                 - Before making the query, check if the user input contains wrong words or not if wrong words then fix the word"
                 - For example "give me umbrella" should become "SELECT * FROM products WHERE title ILIKE '%umbrella%' OR description ILIKE '%umbrella%'"
                 - Show only 5 matching results to the user
                 - Handle natural language product searches by extracting the product name and using it in a LIKE/ILIKE search
                 - If input cannot be converted to SQL, respond with 'ERROR: ' prefix
                 - Use provided timestamp and user when relevant to queries
                 - Use the following tables and columns to make the query:
                 - ${tableString}`
            },
            {
                role: "user",
                content: userInput?.search,
            },
        ],
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,
        max_tokens: 500,
    });

    console.log(completion.choices[0]?.message?.content);

    return completion.choices[0]?.message?.content || "ERROR: No response generated";
}


export const config = {
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


export async function searchProducts(search) {
    console.log("search", search);
    const client = await pool.connect();
    try {

        const sqlQuery = await generateSQLQuery(search);

        if (sqlQuery.startsWith("ERROR:")) {
            console.error(sqlQuery);
            return;
        }

        console.log("Generated SQL Query:");
        console.log(sqlQuery);
        const result = await client.query(sqlQuery);

        console.log("result", result);

        if (result.rowCount > 0) {
            const data = result?.rows?.map((e, i) => {
                // return ({ title: e?.metadata?.title,description: e?.metadata?.description,price: e?.metadata?.price,})))
                return ({ title: e?.metadata?.title,description: e?.metadata?.description,price: e?.metadata?.price,image:e?.metadata?.image})
            })
            return {message:"Here is some exact match of the product",data}
        } else {
            // Initialize vector store
            const vectorStore = await PGVectorStore.initialize(embeddings, config);

            // Search for similar products
            const results = await vectorStore.similaritySearchWithScore(search?.search, 5);

            //reranking the results based on the similarity score
            const sortedResults = results.sort((a, b) => a[1] - b[1]);
            // console.log("sortedResults", sortedResults);
            const data = sortedResults.map((result, i) => {
                return ({ title: result[0]?.metadata?.title,description: result[0]?.metadata?.description,price: result[0]?.metadata?.price,image:result[0]?.metadata?.image})
            });
            return {message:"Here is some similar product of the product",data}

            
        }
    } catch (error) {
        console.log(error)
        // console.error("Error generating SQL query:", error);
        console.log('No results found');
    } finally {
        client.release();
    }
    console.log("search from module", search);
}

