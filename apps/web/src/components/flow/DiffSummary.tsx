/**
 * DiffSummary — 节点变更摘要组件
 * 可复用于发布前预览和版本对比
 */

import type { NodeDiffResult } from "@/lib/diff";

interface DiffSummaryProps {
  diff: NodeDiffResult;
}

export function DiffSummary({ diff }: DiffSummaryProps) {
  const { added, removed, modified } = diff;
  const total = added.length + removed.length + modified.length;

  if (total === 0) {
    return (
      <div className="text-xs text-muted-foreground py-2 text-center">与上一版本相比无变更</div>
    );
  }

  return (
    <div className="space-y-3">
      {added.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs font-medium text-green-600">新增节点 ({added.length})</span>
          </div>
          <div className="pl-3.5 space-y-0.5">
            {added.map((n) => (
              <div key={n.id} className="text-xs text-muted-foreground">
                + {n.name}
              </div>
            ))}
          </div>
        </div>
      )}

      {removed.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-xs font-medium text-red-600">删除节点 ({removed.length})</span>
          </div>
          <div className="pl-3.5 space-y-0.5">
            {removed.map((n) => (
              <div key={n.id} className="text-xs text-muted-foreground">
                - {n.name}
              </div>
            ))}
          </div>
        </div>
      )}

      {modified.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-2 h-2 rounded-full bg-yellow-500" />
            <span className="text-xs font-medium text-yellow-600">
              修改节点 ({modified.length})
            </span>
          </div>
          <div className="pl-3.5 space-y-0.5">
            {modified.map(({ oldNode, newNode }) => (
              <div key={newNode.id} className="text-xs text-muted-foreground">
                ~ {oldNode.name}
                {oldNode.name !== newNode.name ? ` → ${newNode.name}` : ""}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
