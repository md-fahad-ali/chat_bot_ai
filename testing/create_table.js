import pkg from 'pg';
const { Pool } = pkg;

// Initialize PostgreSQL connection pool
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'chat_bot',
  password: '1234',
  port: 5432,
});

async function createProductsTable() {
  const client = await pool.connect();
  try {
    // Create vector extension if it doesn't exist
    await client.query('CREATE EXTENSION IF NOT EXISTS vector;');

    // Create products table
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        price DECIMAL(10,2),
        image_url TEXT,
        image_url2 TEXT,
        text_embedding vector(128),
        image_embedding vector(512)
      );
    `);

    console.log('Products table created successfully');
  } catch (error) {
    console.error('Error creating table:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

createProductsTable();


