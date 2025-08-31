# syntax=docker/dockerfile:1
FROM node:20-slim

#Install build deps for native modules (sharp, better-sqlite3)
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# App directory
WORKDIR /app

# install only production deps
COPY package*.json ./
RUN npm ci --omit=dev

#Copy source
COPY src ./src

#runtime data directory insdie the container
RUN mkdir -p /app/data

#defaults (overridable at runtime)
ENV PORT=8080
ENV DATA_DIR=/app/data

EXPOSE 8080

CMD ["node", "src/server.js"]