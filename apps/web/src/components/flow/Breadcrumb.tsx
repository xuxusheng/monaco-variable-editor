import { memo, useCallback } from "react";
import { useWorkflowStore } from "@/stores/workflow";
import { getContainerShortName } from "@/types/container";
import { ChevronRight, Home } from "lucide-react";

/**
 * 容器嵌套面包屑导航
 * 显示格式：工作流名称 > ForEach(items) > If(env=='prod')
 * 点击任意层级可返回该层
 */
export const Breadcrumb = memo(() => {
  const expandedContainers = useWorkflowStore((s) => s.expandedContainers);
  const nodes = useWorkflowStore((s) => s.nodes);
  const workflowName = useWorkflowStore((s) => s.workflowMeta.name);
  const collapseToContainer = useWorkflowStore((s) => s.collapseToContainer);
  const clearExpandedContainers = useWorkflowStore((s) => s.clearExpandedContainers);

  // 没有展开的容器时不显示
  if (expandedContainers.length === 0) return null;

  // 构建面包屑条目
  const items = expandedContainers
    .map((id) => {
      const node = nodes.find((n) => n.id === id);
      if (!node) return null;
      const shortName = getContainerShortName(node.type);
      // 尝试从 spec 中获取条件/表达式摘要
      const spec = node.spec as Record<string, unknown>;
      let summary = "";
      if (node.type.endsWith(".ForEach") || node.type.endsWith(".ForEachItem")) {
        const items = spec.items;
        summary =
          typeof items === "string"
            ? items
            : Array.isArray(items)
              ? items.join(", ")
              : items != null
                ? JSON.stringify(items)
                : "";
      } else if (node.type.endsWith(".If")) {
        const condition = spec.condition;
        summary =
          typeof condition === "string"
            ? condition
            : condition != null
              ? JSON.stringify(condition)
              : "";
      }
      return { id, shortName, name: node.name, summary };
    })
    .filter(Boolean) as { id: string; shortName: string; name: string; summary: string }[];

  const handleGoHome = useCallback(() => {
    clearExpandedContainers();
  }, [clearExpandedContainers]);

  const handleClick = useCallback(
    (id: string) => {
      collapseToContainer(id);
    },
    [collapseToContainer],
  );

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-40 flex items-center gap-0.5 px-2.5 py-1.5 bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-sm text-xs max-w-[600px] overflow-x-auto">
      {/* 工作流根节点 */}
      <button
        onClick={handleGoHome}
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors shrink-0"
        title="返回顶级"
      >
        <Home className="w-3 h-3" />
        <span className="truncate max-w-[100px]">{workflowName}</span>
      </button>

      {items.map((item, i) => (
        <span key={item.id} className="flex items-center gap-0.5 shrink-0">
          <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
          {i < items.length - 1 ? (
            <button
              onClick={() => handleClick(item.id)}
              className="text-muted-foreground hover:text-foreground transition-colors truncate max-w-[180px]"
              title={item.name}
            >
              {item.shortName}
              {item.summary && (
                <span className="text-muted-foreground/60">({truncate(item.summary, 20)})</span>
              )}
            </button>
          ) : (
            <span className="text-foreground font-medium truncate max-w-[180px]" title={item.name}>
              {item.shortName}
              {item.summary && (
                <span className="text-muted-foreground/60">({truncate(item.summary, 20)})</span>
              )}
            </span>
          )}
        </span>
      ))}
    </div>
  );
});

Breadcrumb.displayName = "Breadcrumb";

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}
