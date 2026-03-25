import { memo, useState } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MissingReference } from "@/lib/referenceChecker";

interface ReferenceStatusBarProps {
  missingRefs: MissingReference[];
  onNavigateToSettings: (tab: "variables" | "secrets") => void;
}

export const ReferenceStatusBar = memo(function ReferenceStatusBar({
  missingRefs,
  onNavigateToSettings,
}: ReferenceStatusBarProps) {
  const [expanded, setExpanded] = useState(false);

  if (missingRefs.length === 0) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-40 border-t bg-card/95 backdrop-blur-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-2 text-xs hover:bg-muted/50 transition-colors"
      >
        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
        <span className="font-medium text-amber-600 dark:text-amber-400">
          {missingRefs.length} 个缺失引用
        </span>
        <span className="text-muted-foreground">— 发布前请先修复</span>
        <ChevronRight
          className={`w-3.5 h-3.5 ml-auto text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
        />
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-1.5 max-h-48 overflow-y-auto border-t">
          {missingRefs.map((ref, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-2 text-sm bg-muted/50 rounded-md px-3 py-1.5"
            >
              <div className="min-w-0 flex items-center gap-2">
                <span
                  className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                    ref.type === "secret"
                      ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                      : ref.type === "variable"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                        : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                  }`}
                >
                  {ref.type === "secret" ? "密钥" : ref.type === "variable" ? "变量" : "输入"}
                </span>
                <span className="font-mono text-xs">{ref.name}</span>
              </div>
              {(ref.type === "secret" || ref.type === "variable") && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigateToSettings(ref.type === "secret" ? "secrets" : "variables");
                  }}
                >
                  去创建
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
