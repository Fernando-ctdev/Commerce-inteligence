# Imagem única para web e worker (ADR-001/ADR-005: segundo processo do mesmo monólito,
# sem serviço de geração separado). Comandos distintos ficam no compose.yaml.
FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build
