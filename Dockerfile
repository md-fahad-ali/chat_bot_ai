# Use Node.js v20 as base image (LTS version)
FROM node:20-slim

# Install system dependencies required for Sharp and other packages
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install app dependencies
RUN npm install

# Copy app source
COPY . .

# Create a directory for images if it doesn't exist
RUN mkdir -p images

# Your app uses environment variables, so we'll need a .env file
# Make sure to create a .env file in your project root with necessary variables:
# MONGO_URI=your_mongodb_connection_string

# Expose the port if you're running a server (adjust if needed)
EXPOSE 3000

# Command to run your application
CMD ["node", "image-search/image_save.js"] 