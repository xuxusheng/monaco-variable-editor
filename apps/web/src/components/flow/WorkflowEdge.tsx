import { memo, useCallback, useEffect, useRef, useState } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from "@xyflow/react";
import type { EdgeProps } from "@xyflow/react";
import type { EdgeType, WorkflowNode, WorkflowEdge as WorkflowEdgeType } from "@/types/workflow";
import { EDGE_STYLES } from "@/types/workflow";
import { useWorkflowStore } from "@/stores/workflow";
import { genNodeId, genEdgeId } from "@/lib/ids";
import { PLUGIN_CATALOG, type PluginEntry } from "@/types/workflow";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { fuzzyMatch } from "@/lib/fuzzyMatch";

interface WorkflowEdgeData {
  edgeType: EdgeType;
  label?: string;
}

export const WorkflowEdge = memo(
  ({
    id,
    source,
    target,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    markerEnd,
  }: EdgeProps) => {
    const edgeData = data as WorkflowEdgeData | undefined;
    const edgeType = edgeData?.edgeType ?? "sequence";
    const label = edgeData?.label;
    const style = EDGE_STYLES[edgeType];

    const [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });

    const [pickerOpen, setPickerOpen] = useState(false);
    const [search, setSearch] = useState("");
    const pickerRef = useRef<HTMLDivElement>(null);

    // Close picker on click outside
    useEffect(() => {
      if (!pickerOpen) return;
      const handler = (e: MouseEvent) => {
        if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
          setPickerOpen(false);
          setSearch("");
        }
      };
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, [pickerOpen]);

    const handleInsert = useCallback(
      (plugin: PluginEntry) => {
        const { nodes, setNodes, setEdges } = useWorkflowStore.getState();

        // Find the source node to inherit containerId/sortIndex context
        const sourceNode = nodes.find((n) => n.id === source);
        const containerId = sourceNode?.containerId ?? null;

        // Calculate sortIndex between source and target
        const targetNode = nodes.find((n) => n.id === target);
        const sourceSort = sourceNode?.sortIndex ?? 0;
        const targetSort = targetNode?.sortIndex ?? sourceSort + 1;
        const newSortIndex = (sourceSort + targetSort) / 2;

        const newNodeId = genNodeId();
        const newNode: WorkflowNode = {
          id: newNodeId,
          type: plugin.type,
          name: plugin.name,
          containerId,
          sortIndex: newSortIndex,
          spec: plugin.defaultSpec ?? {},
          ui: { x: (sourceX + targetX) / 2, y: (sourceY + targetY) / 2 },
        };

        // Create two new edges to replace the original
        const edgeToNew: WorkflowEdgeType = {
          id: genEdgeId(),
          source,
          target: newNodeId,
          type: edgeType,
        };
        const edgeFromNew: WorkflowEdgeType = {
          id: genEdgeId(),
          source: newNodeId,
          target,
          type: edgeType,
        };

        setNodes((prev) => [...prev, newNode]);
        setEdges((prev) => [...prev.filter((e) => e.id !== id), edgeToNew, edgeFromNew]);

        // Select the new node and open task config
        const { setSelectedNodeId, setRightPanel } = useWorkflowStore.getState();
        setSelectedNodeId(newNodeId);
        setRightPanel("task");

        setPickerOpen(false);
        setSearch("");
      },
      [id, source, target, sourceX, sourceY, targetX, targetY, edgeType],
    );

    const filteredPlugins = search
      ? PLUGIN_CATALOG.filter((p) => fuzzyMatch(search, p.name) || fuzzyMatch(search, p.type))
      : PLUGIN_CATALOG;

    return (
      <>
        <BaseEdge
          id={id}
          path={edgePath}
          markerEnd={markerEnd}
          style={{
            stroke: style.stroke,
            strokeWidth: style.strokeWidth,
            strokeDasharray: style.strokeDasharray,
          }}
        />
        {label && (
          <EdgeLabelRenderer>
            <div
              className="nodrag nopan absolute px-1.5 py-0.5 rounded text-[10px] font-medium bg-white border shadow-sm"
              style={{
                color: style.stroke,
                borderColor: `${style.stroke}44`,
                transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              }}
            >
              {label}
            </div>
          </EdgeLabelRenderer>
        )}
        <EdgeLabelRenderer>
          {!pickerOpen ? (
            <button
              className="nodrag nopan absolute w-6 h-6 rounded-full bg-background border border-border shadow-sm flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary hover:bg-primary/10 transition-all opacity-40 hover:opacity-100"
              style={{
                transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              }}
              onClick={(e) => {
                e.stopPropagation();
                setPickerOpen(true);
              }}
              title="插入节点"
            >
              <span className="text-sm font-bold leading-none">+</span>
            </button>
          ) : (
            <div
              ref={pickerRef}
              className="nodrag nopan absolute w-52 bg-card border border-border rounded-lg shadow-lg overflow-hidden"
              style={{
                transform: `translate(-50%, -100%) translate(${labelX}px,${labelY - 8}px)`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border">
                <Search className="w-3 h-3 text-muted-foreground shrink-0" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索插件..."
                  className="h-5 text-xs border-0 px-1 focus-visible:ring-0"
                  autoFocus
                />
                <button
                  onClick={() => {
                    setPickerOpen(false);
                    setSearch("");
                  }}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto py-1">
                {filteredPlugins.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                    无匹配插件
                  </div>
                )}
                {filteredPlugins.map((plugin) => (
                  <button
                    key={plugin.type}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                    onClick={() => handleInsert(plugin)}
                  >
                    <div className="font-medium">{plugin.name}</div>
                    <div className="text-muted-foreground font-mono text-[10px] truncate">
                      {plugin.type.split(".").pop()}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </EdgeLabelRenderer>
      </>
    );
  },
);

WorkflowEdge.displayName = "WorkflowEdge";
