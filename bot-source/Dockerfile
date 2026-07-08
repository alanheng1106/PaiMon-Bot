# 1. Start with a lightweight, official Node.js environment
FROM node:20-slim

# 2. Create a folder inside the container to hold your bot's files
WORKDIR /usr/src/app

# Install packages
RUN apt-get update && apt-get install -y fonts-noto && rm -rf /var/lib/apt/lists/*

# 3. Copy ONLY your package files first
COPY package*.json ./

# 4. Install your bot's dependencies
RUN npm install

# 5. Copy the rest of your bot's source code into the container
COPY . .

# 6. Tell Docker how to start your bot
CMD ["node", "index.js"]
