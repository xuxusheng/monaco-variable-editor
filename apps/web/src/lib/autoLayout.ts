import dagre from "dagre";
import type { Node, Edge } from "@xyflow/react";

export function getLayoutedElements(nodes: Node[], edges: Edge[], direction: "TB" | "LR" = "TB") {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  const nodeWidth = 200;
  const nodeHeight = 60;

  dagreGraph.setGraph({ rankdir: direction, ranksep: 80, nodesep: 60 });

  for (const node of nodes) {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  }
  for (const edge of edges) {
    dagreGraph.setEdge(edge.source, edge.target);
  }

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const pos = dagreGraph.node(node.id);
    return {
      ...node,
      position: { x: pos.x - nodeWidth / 2, y: pos.y - nodeHeight / 2 },
    };
  });

  return { nodes: layoutedNodes, edges };
}
