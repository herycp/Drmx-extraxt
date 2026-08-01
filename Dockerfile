FROM node:20-slim

WORKDIR /app

# Copy package.json
COPY package*.json ./

# Install dependencies secara otomatis
RUN npm install

# Copy seluruh source code
COPY . .

# Expose port server
EXPOSE 8000

# Jalankan server
CMD ["node", "server.js"]
