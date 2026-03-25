import { useState, useCallback, useMemo, type DragEvent } from "react";
import { Package, Clock, Search, X, ChevronRight } from "lucide-react";
import {
  PLUGIN_CATALOG,
  CATEGORY_COLORS,
  type PluginEntry,
  type PluginCategory,
} from "@/types/workflow";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";

const CATEGORY_LABELS: Record<PluginCategory, string> = {
  flow: "控制流",
  http: "HTTP",
  script: "脚本",
  jdbc: "JDBC",
  serdes: "序列化",
  storage: "存储",
  other: "其他",
};

// Task/Trigger/Script filter tags — map to underlying categories
const FILTER_TAGS = [
  { key: "all", label: "全部" },
  { key: "flow", label: "Flow" },
  { key: "task", label: "Task" }, // http, jdbc, storage, serdes, other
  { key: "trigger", label: "Trigger" }, // placeholder — no trigger plugins yet
  { key: "script", label: "Script" },
] as const;

type FilterTag = (typeof FILTER_TAGS)[number]["key"];

/** Map a filter tag to the set of PluginCategory values it covers */
function tagToCategories(tag: FilterTag): Set<PluginCategory> | "all" {
  if (tag === "all") return "all";
  if (tag === "flow") return new Set(["flow"]);
  if (tag === "script") return new Set(["script"]);
  if (tag === "task") return new Set(["http", "jdbc", "serdes", "storage", "other"]);
  // trigger — no plugins yet, return empty set
  return new Set<PluginCategory>();
}

// ---------- Recently-used (localStorage) ----------

const RECENT_KEY = "weave-recent-plugins";
const MAX_RECENT = 5;

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

function pushRecent(type: string) {
  const list = loadRecent().filter((t) => t !== type);
  list.unshift(type);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
}

// ---------- Fuzzy match ----------

function fuzzyMatch(query: string, text: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  // substring match first
  if (t.includes(q)) return true;
  // character-sequence match
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

// ---------- Component ----------

interface NodeCreatePanelProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function NodeCreatePanel({ isOpen, onToggle }: NodeCreatePanelProps) {
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<FilterTag>("all");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [recentTypes, setRecentTypes] = useState<string[]>(() => loadRecent());

  const filteredPlugins = useMemo(() => {
    let pool = PLUGIN_CATALOG;

    // Category tag filter
    const cats = tagToCategories(activeTag);
    if (cats !== "all") {
      pool = pool.filter((p) => cats.has(p.category));
    }

    // Fuzzy search
    if (search) {
      pool = pool.filter((p) => fuzzyMatch(search, p.name) || fuzzyMatch(search, p.type));
    }

    return pool;
  }, [search, activeTag]);

  const grouped = useMemo(
    () =>
      filteredPlugins.reduce(
        (acc, plugin) => {
          const cat = plugin.category;
          if (!acc[cat]) acc[cat] = [];
          acc[cat].push(plugin);
          return acc;
        },
        {} as Record<string, PluginEntry[]>,
      ),
    [filteredPlugins],
  );

  // Recently-used plugin entries
  const recentPlugins = useMemo(() => {
    if (search || activeTag !== "all") return []; // hide when filtering
    return recentTypes
      .map((t) => PLUGIN_CATALOG.find((p) => p.type === t))
      .filter((p): p is PluginEntry => !!p)
      .slice(0, MAX_RECENT);
  }, [recentTypes, search, activeTag]);

  const toggleCategory = useCallback((cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const onDragStart = useCallback((event: DragEvent, plugin: PluginEntry) => {
    event.dataTransfer.setData(
      "application/reactflow",
      JSON.stringify({ type: plugin.type, name: plugin.name, defaultSpec: plugin.defaultSpec }),
    );
    event.dataTransfer.effectAllowed = "move";
    // Track recent
    pushRecent(plugin.type);
    setRecentTypes(loadRecent());
  }, []);

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="absolute left-3 top-3 z-10 w-9 h-9 rounded-lg bg-card border border-border shadow-sm flex items-center justify-center text-sm hover:bg-muted transition-colors"
        title="插件面板"
      >
        <Package className="w-4 h-4" />
      </button>
    );
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
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索插件..."
            className="pl-7 pr-7 h-7 text-sm"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Category filter tags */}
      <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-border">
        {FILTER_TAGS.map((tag) => (
          <button
            key={tag.key}
            onClick={() => setActiveTag(tag.key)}
            className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
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
        {/* Recently used — only shown when no search/filter */}
        {recentPlugins.length > 0 && (
          <div className="border-b border-border">
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              <Clock className="w-3 h-3" />
              最近使用
            </div>
            <div className="pb-1">
              {recentPlugins.map((plugin) => (
                <div
                  key={`recent-${plugin.type}`}
                  draggable
                  onDragStart={(e) => onDragStart(e, plugin)}
                  className="mx-2 mb-1 px-3 py-1.5 rounded-md border border-transparent hover:border-border hover:bg-muted/50 cursor-grab active:cursor-grabbing transition-colors"
                >
                  <div className="text-sm font-medium">{plugin.name}</div>
                  <div className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">
                    {plugin.type.split(".").pop()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {Object.entries(grouped).map(([cat, plugins]) => {
          const isCollapsed = collapsedCategories.has(cat);
          return (
            <Collapsible key={cat} open={!isCollapsed} onOpenChange={() => toggleCategory(cat)}>
              <CollapsibleTrigger className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted/50 transition-colors">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{
                    background: CATEGORY_COLORS[cat as PluginCategory] ?? CATEGORY_COLORS.other,
                  }}
                />
                {CATEGORY_LABELS[cat as PluginCategory] ?? cat}
                <ChevronRight
                  className={`ml-auto w-3 h-3 transition-transform ${isCollapsed ? "" : "rotate-90"}`}
                />
              </CollapsibleTrigger>

              <CollapsibleContent>
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
              </CollapsibleContent>
            </Collapsible>
          );
        })}

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
  );
}
