import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import pkg from 'pg';
const { Pool } = pkg;
import fs from 'fs';
import { AutoTokenizer, AutoModel } from "@xenova/transformers";
import readline from 'readline-sync';

// Initialize the model with proper configuration
const model = new HuggingFaceTransformersEmbeddings({
  model: "Xenova/all-MiniLM-L6-v2",
  dtype: "fp32",
  maxLength: 128
});

// Database configuration
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'chat_bot',
    password: '1234',
    port: 5432,
});

async function searchSimilarProducts(searchText, limit = 5) {
    try {
        const client = await pool.connect();

        // Preprocess search text
        const normalizedText = searchText.toLowerCase().trim().replace(/\s+/g, ' ');
        console.log('Searching for:', normalizedText);

        // Generate and normalize search embedding
        const searchEmbedding = await model.embedQuery(normalizedText);
        
        // Validate embedding
        if (!searchEmbedding || searchEmbedding.length !== 384) {
            throw new Error(`Invalid embedding dimension: ${searchEmbedding?.length}`);
        }

        // Normalize the search embedding
        const magnitude = Math.sqrt(searchEmbedding.reduce((sum, val) => sum + val * val, 0));
        const normalizedEmbedding = searchEmbedding.map(val => val / magnitude);

        const formattedEmbedding = `[${normalizedEmbedding.join(',')}]`;

        // Improved search query with better similarity calculation
        const query = `
        WITH similarity_search AS (
            SELECT 
                title,
                description,
                price,
                image_url,
                image_url2,
                text_embedding <=> $1::vector as cosine_distance,
                1 - (text_embedding <=> $1::vector) as similarity_score
            FROM products
            WHERE text_embedding IS NOT NULL
        )
        SELECT 
            title,
            description,
            price,
            image_url,
            image_url2,
            similarity_score
        FROM similarity_search
        WHERE similarity_score > 0
        ORDER BY similarity_score DESC
        LIMIT $2;
        `;

        const result = await client.query(query, [formattedEmbedding, limit]);
        client.release();

        // Log search results for debugging
        console.log(`Found ${result.rows.length} results`);
        
        const products = result.rows.map(row => ({
            title: row.title,
            description: row.description,
            price: row.price,
            imageUrl: row.image_url,
            imageUrl2: row.image_url2,
            similarity: parseFloat(row.similarity_score).toFixed(4)
        }));

        // Log first result's similarity for debugging
        if (products.length > 0) {
            console.log('Top result similarity:', products[0].similarity);
        }

        return products;

    } catch (error) {
        console.error('Error searching similar products:', error);
        throw error;
    }
}

// Example usage
async function main() {
    try {
        const searchText = readline.question('Enter the search text: ');
        console.log('Searching for products...');
        
        const searchResults = await searchSimilarProducts(searchText);
        console.log('Search Results:', JSON.stringify(searchResults, null, 2));
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

main();

