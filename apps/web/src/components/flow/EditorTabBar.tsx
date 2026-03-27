import { memo, useState, useRef, useEffect } from "react";
import {
  LayoutDashboard,
  FileText,
  Download,
  History,
  ScrollText,
  Zap,
  Settings,
  MoreHorizontal,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

const CORE_TABS = [
  { key: "canvas", label: "画布", icon: LayoutDashboard },
  { key: "yaml", label: "YAML", icon: FileText },
  { key: "inputs", label: "输入参数", icon: Download },
] as const;

const MORE_TABS = [
  { key: "executions", label: "执行历史", icon: History, route: "executions" },
  { key: "versions", label: "版本", icon: ScrollText, route: "versions" },
  { key: "triggers", label: "触发器", icon: Zap, route: "triggers" },
  { key: "settings", label: "设置", icon: Settings },
] as const;

export type TabKey = (typeof CORE_TABS)[number]["key"] | (typeof MORE_TABS)[number]["key"];

interface EditorTabBarProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  onOpenInNewPage?: (tab: TabKey) => void;
}

export const EditorTabBar = memo(function EditorTabBar({
  activeTab,
  onTabChange,
  onOpenInNewPage,
}: EditorTabBarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [moreOpen]);

  const isMoreTabActive = MORE_TABS.some((t) => t.key === activeTab);

  return (
    <div className="h-9 border-b border-border bg-card flex items-center px-1 md:px-2 shrink-0 overflow-x-auto whitespace-nowrap scrollbar-none">
      {CORE_TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            className={cn(
              "relative flex items-center gap-1 px-2.5 md:px-3 h-9 text-xs font-medium transition-colors shrink-0",
              isActive
                ? "text-foreground border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground border-b-2 border-transparent",
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{tab.label}</span>
          </button>
        );
      })}

      {/* More dropdown */}
      <div ref={moreRef} className="relative">
        <button
          onClick={() => setMoreOpen(!moreOpen)}
          className={cn(
            "relative flex items-center gap-1 px-2.5 md:px-3 h-9 text-xs font-medium transition-colors shrink-0",
            isMoreTabActive
              ? "text-foreground border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground border-b-2 border-transparent",
          )}
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
          <span>更多</span>
        </button>

        {moreOpen && (
          <div className="absolute top-full left-0 mt-0.5 w-44 bg-card border border-border rounded-md shadow-lg z-50 py-1">
            {MORE_TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              const Icon = tab.icon;
              return (
                <div key={tab.key} className="flex items-center">
                  <button
                    onClick={() => {
                      onTabChange(tab.key);
                      setMoreOpen(false);
                    }}
                    className={cn(
                      "flex-1 flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted transition-colors text-left",
                      isActive ? "text-foreground font-medium" : "text-muted-foreground",
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                  {"route" in tab && onOpenInNewPage && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenInNewPage(tab.key);
                        setMoreOpen(false);
                      }}
                      className="px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      title="在新页面打开"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});
