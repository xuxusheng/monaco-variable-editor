import { useState, useCallback, useMemo, type DragEvent } from "react"
import { Package } from "lucide-react"
import {
  PLUGIN_CATALOG,
  CATEGORY_COLORS,
  type PluginEntry,
  type PluginCategory,
} from "@/types/workflow"

const CATEGORY_LABELS: Record<PluginCategory, string> = {
  flow: "控制流",
  http: "HTTP",
  script: "脚本",
  jdbc: "JDBC",
  serdes: "序列化",
  storage: "存储",
  other: "其他",
}

interface NodeCreatePanelProps {
  isOpen: boolean
  onToggle: () => void
}

export function NodeCreatePanel({ isOpen, onToggle }: NodeCreatePanelProps) {
  const [search, setSearch] = useState("")
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(Object.keys(CATEGORY_LABELS)),
  )

  const filteredPlugins = useMemo(
    () =>
      PLUGIN_CATALOG.filter(
        (p) =>
          p.name.includes(search) ||
          p.type.toLowerCase().includes(search.toLowerCase()),
      ),
    [search],
  )

  const grouped = useMemo(
    () =>
      filteredPlugins.reduce(
        (acc, plugin) => {
          const cat = plugin.category
          if (!acc[cat]) acc[cat] = []
          acc[cat].push(plugin)
          return acc
        },
        {} as Record<string, PluginEntry[]>,
      ),
    [filteredPlugins],
  )

  const toggleCategory = useCallback((cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }, [])

  const onDragStart = useCallback(
    (event: DragEvent, plugin: PluginEntry) => {
      event.dataTransfer.setData(
        "application/reactflow",
        JSON.stringify({ type: plugin.type, name: plugin.name, defaultSpec: plugin.defaultSpec }),
      )
      event.dataTransfer.effectAllowed = "move"
    },
    [],
  )

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="absolute left-3 top-3 z-10 w-9 h-9 rounded-lg bg-card border border-border shadow-sm flex items-center justify-center text-sm hover:bg-muted transition-colors"
        title="插件面板"
      >
        <Package className="w-4 h-4" />
      </button>
    )
  }

  return (
    <div className="absolute left-0 top-0 bottom-0 w-64 bg-card border-r border-border shadow-sm z-10 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <span className="text-sm font-semibold">插件面板</span>
        <button
          onClick={onToggle}
          className="w-6 h-6 rounded hover:bg-muted flex items-center justify-center text-xs text-muted-foreground"
        >
          ✕
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-border">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索插件..."
          className="w-full px-2.5 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Plugin list */}
      <div className="flex-1 overflow-y-auto">
        {Object.entries(grouped).map(([cat, plugins]) => (
          <div key={cat}>
            <button
              onClick={() => toggleCategory(cat)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: CATEGORY_COLORS[cat as PluginCategory] ?? CATEGORY_COLORS.other }}
              />
              {CATEGORY_LABELS[cat as PluginCategory] ?? cat}
              <span className="ml-auto text-[10px]">
                {expandedCategories.has(cat) ? "▾" : "▸"}
              </span>
            </button>

            {expandedCategories.has(cat) && (
              <div className="pb-1">
                {plugins.map((plugin) => (
                  <div
                    key={plugin.type}
                    draggable
                    onDragStart={(e) => onDragStart(e, plugin)}
                    className="mx-2 mb-1 px-3 py-2 rounded-md border border-transparent hover:border-border hover:bg-muted/50 cursor-grab active:cursor-grabbing transition-colors"
                  >
                    <div className="text-sm font-medium">{plugin.name}</div>
                    <div className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">
                      {plugin.type.split(".").pop()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {filteredPlugins.length === 0 && (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            没有找到匹配的插件
          </div>
        )}
      </div>

      {/* Hint */}
      <div className="px-3 py-2 border-t border-border text-[10px] text-muted-foreground">
        拖拽插件到画布创建节点
      </div>
    </div>
  )
}
