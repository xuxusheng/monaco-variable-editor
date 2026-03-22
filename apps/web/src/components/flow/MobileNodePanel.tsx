import { useState, useCallback, useMemo, type DragEvent } from "react"
import { Search, X } from "lucide-react"
import {
  PLUGIN_CATALOG,
  CATEGORY_COLORS,
  type PluginEntry,
  type PluginCategory,
} from "@/types/workflow"
import { Input } from "@/components/ui/input"

const CATEGORY_LABELS: Record<PluginCategory, string> = {
  flow: "控制流",
  http: "HTTP",
  script: "脚本",
  jdbc: "JDBC",
  serdes: "序列化",
  storage: "存储",
  other: "其他",
}

const FILTER_TAGS = [
  { key: "all", label: "全部" },
  { key: "flow", label: "Flow" },
  { key: "task", label: "Task" },
  { key: "trigger", label: "Trigger" },
  { key: "script", label: "Script" },
] as const

type FilterTag = (typeof FILTER_TAGS)[number]["key"]

function tagToCategories(tag: FilterTag): Set<PluginCategory> | "all" {
  if (tag === "all") return "all"
  if (tag === "flow") return new Set(["flow"])
  if (tag === "script") return new Set(["script"])
  if (tag === "task") return new Set(["http", "jdbc", "serdes", "storage", "other"])
  return new Set<PluginCategory>()
}

function fuzzyMatch(query: string, text: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (t.includes(q)) return true
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++
  }
  return qi === q.length
}

export function MobileNodePanel() {
  const [search, setSearch] = useState("")
  const [activeTag, setActiveTag] = useState<FilterTag>("all")

  const filteredPlugins = useMemo(() => {
    let pool = PLUGIN_CATALOG
    const cats = tagToCategories(activeTag)
    if (cats !== "all") {
      pool = pool.filter((p) => cats.has(p.category))
    }
    if (search) {
      pool = pool.filter(
        (p) => fuzzyMatch(search, p.name) || fuzzyMatch(search, p.type),
      )
    }
    return pool
  }, [search, activeTag])

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

  return (
    <div className="flex flex-col gap-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索插件..."
          className="pl-8 pr-8 h-9 text-sm"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Category filter tags */}
      <div className="flex flex-wrap gap-1.5">
        {FILTER_TAGS.map((tag) => (
          <button
            key={tag.key}
            onClick={() => setActiveTag(tag.key)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              activeTag === tag.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {tag.label}
          </button>
        ))}
      </div>

      {/* Plugin list */}
      <div className="flex-1 overflow-y-auto">
        {Object.entries(grouped).map(([cat, plugins]) => (
          <div key={cat} className="mb-2">
            <div className="flex items-center gap-2 px-1 py-1.5 text-xs font-semibold text-muted-foreground">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: CATEGORY_COLORS[cat as PluginCategory] ?? CATEGORY_COLORS.other }}
              />
              {CATEGORY_LABELS[cat as PluginCategory] ?? cat}
            </div>
            {plugins.map((plugin) => (
              <div
                key={plugin.type}
                draggable
                onDragStart={(e) => onDragStart(e, plugin)}
                className="mb-1 px-3 py-2.5 rounded-lg border border-border/50 hover:bg-muted/50 active:bg-muted cursor-grab active:cursor-grabbing transition-colors"
              >
                <div className="text-sm font-medium">{plugin.name}</div>
                <div className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">
                  {plugin.type.split(".").pop()}
                </div>
              </div>
            ))}
          </div>
        ))}

        {filteredPlugins.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            没有找到匹配的插件
          </div>
        )}
      </div>
    </div>
  )
}
