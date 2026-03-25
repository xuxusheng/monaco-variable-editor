/**
 * NamespaceSettings — 项目空间设置面板
 * Tabs: Variables, Secrets, API Key
 */

import { useState, useEffect } from "react";
import { Settings, X, Copy, RefreshCw, Eye, EyeOff, Key } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { VariableTable } from "./VariableTable";
import { SecretTable } from "./SecretTable";

interface NamespaceSettingsProps {
  namespaceId: string;
  namespaceName: string;
  onClose: () => void;
  defaultTab?: "variables" | "secrets";
}

export function NamespaceSettings({
  namespaceId,
  namespaceName,
  onClose,
  defaultTab = "variables",
}: NamespaceSettingsProps) {
  const [activeTab, setActiveTab] = useState<string>(defaultTab);

  // 当 defaultTab 变化时（从外部跳转过来），更新当前 tab
  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  return (
    <div className="w-96 border-l border-border bg-card flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">项目空间设置</span>
          <span className="text-xs text-muted-foreground">({namespaceName})</span>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} title="关闭">
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList variant="line" className="w-full rounded-none border-b border-border">
          <TabsTrigger value="variables" className="flex-1 text-xs">
            变量
          </TabsTrigger>
          <TabsTrigger value="secrets" className="flex-1 text-xs">
            密钥
          </TabsTrigger>
          <TabsTrigger value="apikey" className="flex-1 text-xs">
            API Key
          </TabsTrigger>
        </TabsList>

        <TabsContent value="variables" className="flex-1 overflow-y-auto p-4">
          <VariableTable namespaceId={namespaceId} />
        </TabsContent>
        <TabsContent value="secrets" className="flex-1 overflow-y-auto p-4">
          <SecretTable namespaceId={namespaceId} />
        </TabsContent>
        <TabsContent value="apikey" className="flex-1 overflow-y-auto p-4">
          <ApiKeyPanel namespaceId={namespaceId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---- ApiKeyPanel sub-component ----

function ApiKeyPanel({ namespaceId }: { namespaceId: string }) {
  const [revealed, setRevealed] = useState(false);

  // tRPC hooks — will fall back to placeholder if procedures don't exist yet
  // @ts-expect-error — namespaceApiKey will be added to the router in M6
  const apiKeyQuery = trpc.workflow.namespaceApiKey.useQuery(
    { namespaceId },
    { enabled: revealed },
  );
  // @ts-expect-error — namespaceApiKeyRegenerate will be added to the router in M6
  const regenerateMutation = trpc.workflow.namespaceApiKeyRegenerate.useMutation({
    onSuccess: () => {
      toast.success("API Key 已重新生成");
      apiKeyQuery.refetch();
    },
    onError: () => toast.error("重新生成失败"),
  });

  const apiKey = apiKeyQuery.data?.key as string | undefined;
  const maskedKey = apiKey
    ? `${apiKey.slice(0, 8)}${"•".repeat(Math.max(apiKey.length - 8, 20))}`
    : null;

  const handleCopy = () => {
    if (apiKey) {
      void navigator.clipboard.writeText(apiKey);
      toast.success("已复制到剪贴板");
    }
  };

  const handleRegenerate = () => {
    if (confirm("重新生成将使当前 API Key 失效，确定继续？")) {
      regenerateMutation.mutate({ namespaceId });
    }
  };

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
            API Key 用于在 Kestra flow 中安全获取项目空间密钥值
          </p>
          <p className="text-xs text-muted-foreground">
            在 Kestra flow 中使用此 API Key 获取密钥值
          </p>
          <div className="bg-muted rounded-md p-3">
            <code className="text-xs text-muted-foreground">
              api_key: &#123;&#123; secret("NAMESPACE_API_KEY") &#125;&#125;
            </code>
          </div>
          <p className="text-xs text-muted-foreground">API Key 管理功能即将上线</p>
        </div>
      </div>
    );
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
            {apiKeyQuery.isLoading ? "加载中..." : revealed ? (apiKey ?? "—") : (maskedKey ?? "—")}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setRevealed(!revealed)}
            title={revealed ? "隐藏" : "显示"}
          >
            {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleCopy}
            disabled={!apiKey}
            title="复制"
          >
            <Copy className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Regenerate */}
        <Button
          variant="destructive"
          size="sm"
          className="w-full"
          onClick={handleRegenerate}
          disabled={regenerateMutation.isPending}
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${regenerateMutation.isPending ? "animate-spin" : ""}`}
          />
          重新生成
        </Button>

        {/* Usage hint */}
        <p className="text-xs text-muted-foreground">在 Kestra flow 中使用此 API Key 获取密钥值</p>
      </div>
    </div>
  );
}
