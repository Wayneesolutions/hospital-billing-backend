# Hospital Billing backend — plain Node/Express API, portable across local
# Docker, AWS App Runner (container image source), and ECS/Fargate without
# changes. Build context is the backend/ folder.

FROM node:20-slim AS base
WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Prisma needs its schema present to generate the client; do this after
# `npm ci` (deps unchanged) but before copying the rest of the source so
# app-code changes don't invalidate this layer either.
COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src

ENV NODE_ENV=production
EXPOSE 4000

# GET /health is already implemented in src/app.js — wire this into your
# App Runner / ECS / load balancer health check.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||4000)+'/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Applies any pending Prisma migrations, then starts the server. `prisma
# migrate deploy` is idempotent, so it's safe to run on every container
# start — but if you scale to many instances deploying at once, prefer
# running migrations as a separate one-off release step instead.
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]
