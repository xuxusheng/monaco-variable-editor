import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import reactScan from "@react-scan/vite-plugin-react-scan";
import { compression } from "vite-plugin-compression2";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    reactScan({
      enable: process.env.NODE_ENV === "development",
      scanOptions: {
        showToolbar: true,
        animationSpeed: "fast",
      },
    }),
    compression({ algorithms: ["gzip"], exclude: [/\.(png|jpe?g|gif|woff2?|ttf)$/i] }),
    compression({ algorithms: ["brotliCompress"], exclude: [/\.(png|jpe?g|gif|woff2?|ttf)$/i] }),
  ],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  server: {
    fs: {
      allow: [".."],
    },
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    include: ["monaco-editor", "@monaco-editor/react", "@monaco-editor/loader"],
  },
  build: {
    commonjsOptions: {
      include: [/monaco-editor/, /node_modules/],
    },
  },
  worker: {
    format: "es",
  },
  lint: {
    ignorePatterns: ["**/dist/**"],
  },
});
