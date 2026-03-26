/**
 * NamespaceSettings — 项目空间设置面板
 * Tabs: Variables, Secrets
 */

import { useState, useEffect } from "react";
import { Settings, X } from "lucide-react";
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
        </TabsList>

        <TabsContent value="variables" className="flex-1 overflow-y-auto p-4">
          <VariableTable namespaceId={namespaceId} />
        </TabsContent>
        <TabsContent value="secrets" className="flex-1 overflow-y-auto p-4">
          <SecretTable namespaceId={namespaceId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
