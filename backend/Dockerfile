# ============================================================
# Legacy CRM Backend — Dockerfile
# Multi-stage build for production optimization
# ============================================================

# ---- Stage 1: Build ----
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY . .
RUN npm install --include=dev
RUN npm run build

# ---- Stage 2: Production ----
FROM node:22-alpine AS production

WORKDIR /app

# Install only production deps
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy compiled JS from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/.env.example ./.env.example

# Security: run as non-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeapp -u 1001 -G nodejs && \
    mkdir -p /app/uploads/knowledge && \
    chown -R nodeapp:nodejs /app/uploads
USER nodeapp

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/server.js"]
