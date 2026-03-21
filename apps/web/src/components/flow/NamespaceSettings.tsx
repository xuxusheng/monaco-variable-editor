/**
 * NamespaceSettings — 命名空间设置面板
 * Tabs: Variables, Secrets, API Key
 */

import { useState } from "react"
import { Settings, X, Copy, RefreshCw, Eye, EyeOff, Key } from "lucide-react"
import { toast } from "sonner"
import { trpc } from "@/lib/trpc"
import { VariableTable } from "./VariableTable"
import { SecretTable } from "./SecretTable"

interface NamespaceSettingsProps {
  namespaceId: string
  namespaceName: string
  onClose: () => void
}

type Tab = "variables" | "secrets" | "apikey"

export function NamespaceSettings({ namespaceId, namespaceName, onClose }: NamespaceSettingsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("variables")

  return (
    <div className="w-96 border-l border-border bg-card flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">命名空间设置</span>
          <span className="text-xs text-muted-foreground">({namespaceName})</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-muted transition-colors"
          title="关闭"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab("variables")}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === "variables"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          变量
        </button>
        <button
          onClick={() => setActiveTab("secrets")}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === "secrets"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          密钥
        </button>
        <button
          onClick={() => setActiveTab("apikey")}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === "apikey"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          API Key
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "variables" && (
          <VariableTable namespaceId={namespaceId} />
        )}
        {activeTab === "secrets" && (
          <SecretTable namespaceId={namespaceId} />
        )}
        {activeTab === "apikey" && (
          <ApiKeyPanel namespaceId={namespaceId} />
        )}
      </div>
    </div>
  )
}

// ---- ApiKeyPanel sub-component ----

function ApiKeyPanel({ namespaceId }: { namespaceId: string }) {
  const [revealed, setRevealed] = useState(false)

  // tRPC hooks — will fall back to placeholder if procedures don't exist yet
  // @ts-expect-error — namespaceApiKey will be added to the router in M6
  const apiKeyQuery = trpc.workflow.namespaceApiKey.useQuery(
    { namespaceId },
    { enabled: revealed },
  )
  // @ts-expect-error — namespaceApiKeyRegenerate will be added to the router in M6
  const regenerateMutation = trpc.workflow.namespaceApiKeyRegenerate.useMutation({
    onSuccess: () => {
      toast.success("API Key 已重新生成")
      apiKeyQuery.refetch()
    },
    onError: () => toast.error("重新生成失败"),
  })

  const apiKey = apiKeyQuery.data?.key as string | undefined
  const maskedKey = apiKey
    ? `${apiKey.slice(0, 8)}${"•".repeat(Math.max(apiKey.length - 8, 20))}`
    : null

  const handleCopy = () => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey)
      toast.success("已复制到剪贴板")
    }
  }

  const handleRegenerate = () => {
    if (confirm("重新生成将使当前 API Key 失效，确定继续？")) {
      regenerateMutation.mutate({ namespaceId })
    }
  }

  // Fallback when tRPC procedures don't exist yet
  if (!apiKeyQuery.data && !apiKeyQuery.isLoading && !apiKeyQuery.error) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Key className="w-4 h-4" />
          <span>API Key</span>
        </div>
        <div className="rounded-lg border border-border p-4 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            API Key 用于在 Kestra flow 中安全获取命名空间密钥值
          </p>
          <p className="text-xs text-muted-foreground">
            在 Kestra flow 中使用此 API Key 获取密钥值
          </p>
          <div className="bg-muted rounded-md p-3">
            <code className="text-xs text-muted-foreground">
              api_key: &#123;&#123; secret("NAMESPACE_API_KEY") &#125;&#125;
            </code>
          </div>
          <p className="text-xs text-muted-foreground">
            API Key 管理功能即将上线
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Key className="w-4 h-4" />
        <span>API Key</span>
      </div>

      <div className="rounded-lg border border-border p-4 space-y-3">
        {/* Key display */}
        <div className="flex items-center gap-2">
          <div className="flex-1 font-mono text-xs bg-muted rounded-md px-3 py-2 overflow-hidden">
            {apiKeyQuery.isLoading
              ? "加载中..."
              : revealed
                ? (apiKey ?? "—")
                : (maskedKey ?? "—")}
          </div>
          <button
            onClick={() => setRevealed(!revealed)}
            className="p-1.5 rounded hover:bg-muted transition-colors"
            title={revealed ? "隐藏" : "显示"}
          >
            {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleCopy}
            disabled={!apiKey}
            className="p-1.5 rounded hover:bg-muted transition-colors disabled:opacity-50"
            title="复制"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Regenerate */}
        <button
          onClick={handleRegenerate}
          disabled={regenerateMutation.isPending}
          className="w-full px-3 py-1.5 rounded-md text-xs font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${regenerateMutation.isPending ? "animate-spin" : ""}`} />
          重新生成
        </button>

        {/* Usage hint */}
        <p className="text-xs text-muted-foreground">
          在 Kestra flow 中使用此 API Key 获取密钥值
        </p>
      </div>
    </div>
  )
}
