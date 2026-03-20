FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html

# 删除默认配置
RUN rm -f /etc/nginx/conf.d/default.conf

# Gzip 配置
RUN cat > /etc/nginx/conf.d/gzip.conf << 'EOF'
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_comp_level 6;
gzip_min_length 256;
gzip_types
    text/plain
    text/css
    text/javascript
    application/javascript
    application/json
    application/xml
    image/svg+xml
    font/woff2;
EOF

# 站点配置
RUN cat > /etc/nginx/conf.d/app.conf << 'EOF'
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源长缓存（文件名带 hash）
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # 根目录图标
    location ~* \.(svg|ico|png|jpg|webp)$ {
        expires 7d;
        add_header Cache-Control "public";
    }

    # Monaco Editor worker（如果用到）
    location ~* \.worker\.js$ {
        add_header Content-Type "application/javascript";
        add_header Cross-Origin-Opener-Policy "same-origin";
        add_header Cross-Origin-Embedder-Policy "require-corp";
    }
}
EOF

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
