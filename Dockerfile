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

# Copy source
COPY . .

# Build all packages
RUN vp run -r build

# --- Frontend (nginx) ---
FROM nginx:alpine AS web
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

RUN rm -f /etc/nginx/conf.d/default.conf

COPY <<'EOF' /etc/nginx/conf.d/gzip.conf
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_comp_level 6;
gzip_min_length 256;
gzip_types text/plain text/css text/javascript application/javascript application/json application/xml image/svg+xml font/woff2;
EOF

COPY <<'EOF' /etc/nginx/conf.d/app.conf
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    location / {
        try_files $uri $uri/ /index.html;
    }
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
EOF

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

# --- Backend (API) ---
FROM node:22-alpine AS api
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY --from=builder /app/pnpm-workspace.yaml /app/package.json /app/pnpm-lock.yaml ./
COPY --from=builder /app/apps/api/package.json ./apps/api/

RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
USER node
CMD ["node", "apps/api/dist/index.js"]
