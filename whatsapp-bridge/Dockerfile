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

# PORT é injetado dinamicamente pelo Railway — não hardcodar aqui
# O healthcheck é gerenciado pelo railway.toml usando a porta correta

CMD ["node", "server.js"]
