export const genNodeId = () => `node_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
export const genEdgeId = () => `edge_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
