import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import loader from "@monaco-editor/loader"

// 使用本地 Monaco 文件，不走 CDN
loader.config({
  paths: { vs: "/monaco-editor/min/vs" },
})

import "./index.css"
import App from "./App.tsx"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
