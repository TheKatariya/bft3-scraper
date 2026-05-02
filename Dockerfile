FROM node:20-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY bft3.js ./

# Credentials are injected at runtime via --env flags; never baked in
CMD ["node", "bft3.js"]
