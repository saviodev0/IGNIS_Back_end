# API do IGNIS (NestJS + Prisma + Mongo). Imagem Debian (glibc), necessária para
# onnxruntime (busca semântica), @napi-rs/canvas (OCR) e bcrypt.

FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json tsconfig.build.json nest-cli.json ./
RUN npx prisma generate

COPY src ./src
RUN npm run build


FROM node:22-bookworm-slim
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    UPLOADS_DIR=/data/arquivos \
    MODELS_DIR=/data/modelos

# openssl: o Prisma (migrate) detecta a versão por ele; ca-certificates: HTTPS para a Groq e downloads dos modelos
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/generated ./generated
COPY prisma ./prisma
COPY prisma.config.ts ./

# Arquivos dos alunos e modelos baixados ficam em /data (monte volumes aqui)
RUN mkdir -p /data/arquivos /data/modelos && chown -R node:node /data
VOLUME ["/data/arquivos", "/data/modelos"]

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Aplica as migrações pendentes e sobe a API
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/src/main"]
