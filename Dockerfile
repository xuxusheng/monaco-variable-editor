FROM oven/bun:1 AS builder
WORKDIR /app

# Copy workspace config for dependency caching
COPY bunfig.toml package.json bun.lock ./
COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

RUN bun install --frozen-lockfile

COPY . .
RUN bun run --parallel --filter '*' build

# --- Production image ---
FROM oven/bun:1-slim
WORKDIR /app

# Copy single bundled backend (includes Prisma WASM, no node_modules needed)
COPY --from=builder /app/apps/api/dist/index.js ./index.js

# Copy prisma files for migrations
COPY --from=builder /app/apps/api/prisma ./prisma
COPY --from=builder /app/apps/api/prisma.config.ts ./

# Copy entrypoint script
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Copy built frontend (served by Hono)
COPY --from=builder /app/apps/web/dist /web/dist

ENV NODE_ENV=production
ENV STATIC_ROOT=/web/dist/
EXPOSE 3000

# Install prisma CLI as bun user for migrations at runtime
RUN bun install -g prisma
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["bun", "run", "index.js"]
