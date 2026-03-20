import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import * as monaco from "monaco-editor"
import loader from "@monaco-editor/loader"

// Monaco worker 配置（必须在 monaco 加载前设置）
;(self as any).MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    const getWorkerUrl = (name: string) => {
      // 使用 Vite 对 worker 的原生支持
      return new URL(`monaco-editor/esm/vs/${name}.worker.js`, import.meta.url).href
    }
    switch (label) {
      case "json":
        return new Worker(getWorkerUrl("language/json/json"), { type: "module" })
      case "css":
        return new Worker(getWorkerUrl("language/css/css"), { type: "module" })
      case "html":
        return new Worker(getWorkerUrl("language/html/html"), { type: "module" })
      case "typescript":
        return new Worker(getWorkerUrl("language/typescript/ts"), { type: "module" })
      default:
        return new Worker(getWorkerUrl("editor/editor.worker"), { type: "module" })
    }
  },
}

// 官方推荐：直接传入 monaco 模块，跳过 AMD CDN 加载
loader.config({ monaco })

import "./index.css"
import App from "./App.tsx"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
