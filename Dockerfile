FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate
RUN curl -fsSL https://vite.plus | bash

# Copy workspace config for dependency caching
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY vite.config.ts ./
COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN vp run -r build

# --- Production image ---
FROM node:22-alpine
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy workspace config + prod deps
COPY --from=builder /app/pnpm-workspace.yaml /app/package.json /app/pnpm-lock.yaml ./
COPY --from=builder /app/apps/api/package.json ./apps/api/

RUN pnpm install --prod --frozen-lockfile

# Copy built backend
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma

# Copy built frontend (served by Hono)
COPY --from=builder /app/apps/web/dist ./apps/web/dist

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
USER node
CMD ["node", "apps/api/dist/index.js"]
