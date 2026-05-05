# ── WhatsApp Bridge — Dockerfile ──────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Dependências (inclui Baileys e suas nativas)
COPY package*.json ./
RUN npm ci && npm cache clean --force

# Código do bridge
COPY server.js ./

# Diretório de sessões — no Railway, mapeado para um Volume persistente
# Sem Volume: sessão perdida a cada deploy (precisa re-escanear QR)
RUN mkdir -p sessions

ENV NODE_ENV=production
ENV PORT=8081

EXPOSE 8081

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget -qO- http://localhost:8081/health || exit 1

CMD ["node", "server.js"]
