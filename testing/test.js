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

async function generateTextEmbedding(text) {
  try {
    // Load tokenizer and model without quantization for full-precision outputs.
    const tokenizer = await AutoTokenizer.from_pretrained("Xenova/all-MiniLM-L6-v2", { quantized: true });
    const textModel = await AutoModel.from_pretrained("Xenova/all-MiniLM-L6-v2", { quantized: true });

    // Preprocess text (trim whitespace to closely match SentenceTransformer's preprocessing)
    const normalizedText = `${text}`.trim();

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



async function generateBatchTextEmbeddings(texts) {
  const tokenizer = await AutoTokenizer.from_pretrained("Xenova/all-MiniLM-L6-v2");
  const textModel = await AutoModel.from_pretrained("Xenova/all-MiniLM-L6-v2");

  const normalizedTexts = texts.map(text => `${text}`.trim());
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
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
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
        await generateImageEmbedding(product.image);
        
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
