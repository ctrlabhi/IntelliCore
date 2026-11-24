# ==============================================================================
# IntelliCore Container Image Specification
# Base: Node.js 24 LTS (Debian Bookworm Slim)
# ==============================================================================

FROM node:24-bookworm-slim

# Install system dependencies (openssl for Prisma, dumb-init for PID 1 signal forwarding)
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    dumb-init \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Set environment
ENV NODE_ENV=development
ENV PORT=3000

# Copy dependency manifests first for optimal Docker layer caching
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies and generate Prisma Client
RUN npm ci && npx prisma generate

# Copy application source code and frontend
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Create uploads directory and ensure permissions
RUN mkdir -p /app/uploads && chown -R node:node /app

# Copy entrypoint script and make executable
COPY backend/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Expose HTTP port
EXPOSE 3000

# Switch to non-root user for security
USER node

# Use dumb-init as init system for proper signal propagation
ENTRYPOINT ["/usr/bin/dumb-init", "--", "/app/entrypoint.sh"]

CMD ["npm", "start"]

