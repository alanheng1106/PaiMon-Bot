# 1. Use official Bun slim image
FROM oven/bun:1-slim

# 2. Create app directory
WORKDIR /usr/src/app

# 3. Install system fonts (for canvas-related features)
RUN apt-get update && apt-get install -y fonts-noto && rm -rf /var/lib/apt/lists/*

# 4. Copy only package files first (for layer caching)
COPY package.json bun.lock* bun.lockb* ./

# 5. Install dependencies
RUN bun install --frozen-lockfile

# 6. Copy the rest of the source code
COPY . .

# 7. Run the bot directly with Bun (no build step needed)
CMD ["bun", "src/index.ts"]
