FROM node:24-bookworm-slim

WORKDIR /app

# Install runtime and build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    ca-certificates \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package specifications
COPY package.json package-lock.json ./

# Install clean dependencies
RUN npm ci --ignore-scripts

# Copy application source
COPY . .

# Run sync scripts and production build
RUN npm run sync:mediapipe && \
    npm run sync:whisper-cli && \
    npm run verify:server-tool-catalog && \
    npm run build

ENV NODE_ENV=production \
    PORT=5174 \
    HOST=0.0.0.0 \
    OPENCHATCUT_ALLOW_REMOTE_HOSTS=1

EXPOSE 5174

CMD ["node", "node_modules/vite/bin/vite.js", "preview", "--config", "config/vite.config.ts", "--port", "5174", "--host", "0.0.0.0"]
