// Kestra workflow types

export interface KestraInput {
  id: string;
  type: string;
  defaults?: string;
  description?: string;
  required?: boolean;
}

export interface KestraTask {
  id: string;
  type: string;
  [key: string]: unknown;
}

export interface KestraWorkflow {
  id: string;
  namespace: string;
  description: string;
  inputs: KestraInput[];
  tasks: KestraTask[];
}

export interface FlowNode {
  id: string;
  type: "taskNode";
  position: { x: number; y: number };
  data: {
    label: string;
    taskConfig: string; // YAML string for the task
  };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
}

export const DEFAULT_TASK_YAML = `id: my-task
type: io.kestra.plugin.core.log.Log
message: "Hello from task"`;

export const DEFAULT_KESTRA_WORKFLOW: KestraWorkflow = {
  id: "my-workflow",
  namespace: "company.team",
  description: "",
  inputs: [
    { id: "env", type: "STRING", defaults: "dev", description: "运行环境" },
    { id: "version", type: "STRING", defaults: "1.0.0", description: "版本号" },
  ],
  tasks: [],
};
