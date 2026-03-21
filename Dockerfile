FROM node:22-alpine AS builder
WORKDIR /app

# 国内镜像源 + 清除代理
ENV http_proxy= https_proxy=
RUN npm config set registry https://registry.npmmirror.com && \
    npm install -g pnpm@9 vite-plus

# Copy workspace config for dependency caching
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY vite.config.ts ./
COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN cd apps/api && npx prisma generate
RUN vp run -r build

# --- Production image ---
FROM node:22-alpine
WORKDIR /app

ENV http_proxy= https_proxy=
RUN npm config set registry https://registry.npmmirror.com && \
    apk add --no-cache libc6-compat wget

# Install prisma CLI for migrations + prod deps
COPY --from=builder /app/apps/api/package.json ./
RUN npm install --omit=dev && npm install prisma@7

# Copy built backend + prisma files
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/prisma ./prisma
COPY --from=builder /app/apps/api/prisma.config.ts ./

# Copy entrypoint script
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Copy built frontend (served by Hono)
COPY --from=builder /app/apps/web/dist ../web/dist

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://localhost:3001/health || exit 1

USER node
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
