import { memo, useCallback } from "react"
import {
  LayoutDashboard,
  FileText,
  Download,
  History,
  ScrollText,
  Zap,
  Settings,
  X,
  ExternalLink,
} from "lucide-react"
import { cn } from "@/lib/utils"

const TABS = [
  { key: "canvas", label: "画布", icon: LayoutDashboard },
  { key: "yaml", label: "YAML", icon: FileText },
  { key: "inputs", label: "输入参数", icon: Download },
  { key: "executions", label: "执行历史", icon: History },
  { key: "versions", label: "版本", icon: ScrollText },
  { key: "triggers", label: "触发器", icon: Zap },
  { key: "settings", label: "设置", icon: Settings },
] as const

export type TabKey = typeof TABS[number]["key"]

interface EditorTabBarProps {
  activeTab: TabKey
  onTabChange: (tab: TabKey) => void
  onOpenInNewPage?: (tab: TabKey) => void
}

export const EditorTabBar = memo(function EditorTabBar({
  activeTab,
  onTabChange,
  onOpenInNewPage,
}: EditorTabBarProps) {
  const handleClose = useCallback(
    (e: React.MouseEvent, tab: TabKey) => {
      e.stopPropagation()
      if (tab === activeTab) {
        onTabChange("canvas")
      }
    },
    [activeTab, onTabChange],
  )

  return (
    <div className="h-9 border-b border-border bg-card flex items-center px-1 md:px-2 shrink-0 overflow-x-auto whitespace-nowrap scrollbar-none">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.key
        const Icon = tab.icon
        return (
          <div key={tab.key} className="relative flex items-center">
            <button
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
              {isActive && tab.key !== "canvas" && (
                <span
                  onClick={(e) => handleClose(e, tab.key)}
                  className="ml-0.5 p-0.5 rounded hover:bg-muted cursor-pointer"
                  title="关闭"
                >
                  <X className="w-3 h-3" />
                </span>
              )}
            </button>
            {onOpenInNewPage && ["executions", "versions", "triggers"].includes(tab.key) && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenInNewPage(tab.key)
                }}
                className="p-0.5 rounded hover:bg-muted hidden md:inline-flex text-muted-foreground hover:text-foreground"
                title="在新页面打开"
              >
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
})
