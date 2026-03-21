FROM node:22 AS builder
WORKDIR /app

# 国内镜像源 + 清除代理（容器里没有宿主机的代理）
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
FROM node:22
WORKDIR /app

ENV http_proxy= https_proxy=
RUN npm config set registry https://registry.npmmirror.com

# Copy api package.json and install prod deps with npm
COPY --from=builder /app/apps/api/package.json ./
RUN npm install --omit=dev

# Copy built backend
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/prisma ./prisma

# Copy built frontend (served by Hono)
COPY --from=builder /app/apps/web/dist ../web/dist

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
USER node
CMD ["node", "dist/index.js"]
