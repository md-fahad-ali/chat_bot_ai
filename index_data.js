import pkg from 'pg';
const { Pool } = pkg;
import { AutoTokenizer, AutoModel } from '@xenova/transformers';
import readline_sync from 'readline-sync';

// Initialize PostgreSQL connection pool
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'chat_bot',
  password: '1234',
  port: 5432,
});

const SIMILARITY_THRESHOLD = 0.2;

async function searchProductsByText(searchText) {
  try {
    // Normalize search text
    const normalizedSearchText = searchText.toLowerCase().trim();

    // Initialize all-MiniLM model
    const tokenizer = await AutoTokenizer.from_pretrained(
      "Xenova/all-MiniLM-L6-v2"
    );
    const textModel = await AutoModel.from_pretrained(
      "Xenova/all-MiniLM-L6-v2",
      { quantized: true }
    );

    // Generate embedding for search text
    const textInputs = await tokenizer(normalizedSearchText, {
      padding: true,
      truncation: true,
      max_length: 128,
      return_tensors: 'pt'
    });
    const textOutput = await textModel(textInputs);
    const meanPooling = Array.from(textOutput.last_hidden_state.data)
      .reduce((acc, val, i) => {
        const idx = Math.floor(i / 384);
        if (!acc[idx]) acc[idx] = [];
        acc[idx].push(val);
        return acc;
      }, [])
      .map(arr => arr.reduce((sum, val) => sum + val, 0) / arr.length);

    // Format vector for PostgreSQL - wrap in [] instead of {}
    const searchVector = '[' + meanPooling.join(',') + ']';

    // Query PostgreSQL using vector similarity search with a dynamic threshold
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          title,
          description,
          price,
          image_url,
          text_embedding <-> $1::vector AS distance
        FROM products
        WHERE text_embedding <-> $1::vector < $2
        ORDER BY distance ASC
        LIMIT 3;
      `, [searchVector, SIMILARITY_THRESHOLD]);

      console.log('Search distances:',);
      console.log(result.rows.map(row => ({
        title: row.title,
        price:row.price,
        distance: row.distance
      })))
      // Log distances for debugging

      // If no results found within threshold, return empty array
      if (!result || !result.rows || result.rows.length === 0) {
        return {
          found: false,
          message: "No matching products found",
          results: []
        };
      }

      
      // Re-rank results based on additional criteria (e.g., price, popularity)
      // const reRankedResults = result.rows.sort((a, b) => a.price - b.price);

      return {
        found: true,
      };
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error searching products:', error);
    throw error;
  }
}

// Example usage
const query = readline_sync.question("Enter a search query: ");
const searchResults = await searchProductsByText(query);  // Removed trailing space
console.log('Search Results:', searchResults);
