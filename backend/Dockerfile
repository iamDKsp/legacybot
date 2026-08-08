# ── Estágio 1: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Instalar dependências primeiro (cache layer)
COPY package*.json ./
RUN npm install --frozen-lockfile

# Copiar fonte e compilar TypeScript
COPY tsconfig.json ./
COPY src ./src
COPY assets ./assets
COPY database ./database

RUN npm run build

# ── Estágio 2: Produção (imagem menor, sem devDeps) ───────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Dependências de produção apenas
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Código compilado do estágio anterior
COPY --from=builder /app/dist ./dist
COPY assets ./assets
COPY database ./database

# Diretório de uploads temporário (PDFs gerados em memória não precisam dele,
# mas o multer pode usar para arquivos de knowledge base)
RUN mkdir -p uploads/phc uploads/knowledge

ENV NODE_ENV=production

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD wget -qO- http://localhost:8080/health || exit 1

CMD ["node", "dist/server.js"]
