import type * as Monaco from "monaco-editor";
import type { KestraInput } from "@/types/kestra";

// Kestra task JSON Schema
const KESTRA_TASK_SCHEMA = {
  type: "object",
  required: ["id", "type"],
  properties: {
    id: {
      type: "string",
      description: "任务唯一标识符",
      pattern: "^[a-zA-Z][a-zA-Z0-9_-]*$",
    },
    type: {
      type: "string",
      description: "Kestra 插件类型（如 io.kestra.plugin.core.log.Log）",
      pattern: "^io\\.kestra\\.plugin\\..+",
    },
    description: {
      type: "string",
      description: "任务描述",
    },
    retry: {
      type: "object",
      description: "重试配置",
      properties: {
        type: { type: "string", enum: ["constant", "exponential", "random"] },
        interval: { type: "string", description: "重试间隔（如 PT5S）" },
        maxAttempt: { type: "integer", minimum: 1, description: "最大重试次数" },
        maxDuration: { type: "string", description: "最大持续时间" },
      },
    },
    timeout: {
      type: "string",
      description: "超时时间（ISO 8601 格式，如 PT1H）",
    },
    disabled: {
      type: "boolean",
      description: "是否禁用该任务",
    },
  },
  additionalProperties: true,
};

// Known Kestra plugin types
const KNOWN_PLUGIN_TYPES = [
  "io.kestra.plugin.core.log.Log",
  "io.kestra.plugin.core.flow.Sequential",
  "io.kestra.plugin.core.flow.Parallel",
  "io.kestra.plugin.core.flow.Switch",
  "io.kestra.plugin.core.flow.EachParallel",
  "io.kestra.plugin.core.flow.EachSequential",
  "io.kestra.plugin.core.flow.Pause",
  "io.kestra.plugin.core.flow.Subflow",
  "io.kestra.plugin.core.http.Request",
  "io.kestra.plugin.core.http.Download",
  "io.kestra.plugin.core.jdbc.Query",
  "io.kestra.plugin.core.storage.LocalFiles",
  "io.kestra.plugin.scripts.python.Script",
  "io.kestra.plugin.scripts.node.Script",
  "io.kestra.plugin.scripts.shell.Commands",
  "io.kestra.plugin.scripts.shell.Script",
  "io.kestra.plugin.serdes.csv.CsvWriter",
  "io.kestra.plugin.serdes.json.JsonWriter",
];

export function setupYamlValidation(
  monaco: typeof Monaco,
  model: Monaco.editor.ITextModel,
  inputs: KestraInput[],
) {
  // 1. JSON Schema validation via monaco-yaml
  import("monaco-yaml")
    .then((mod) => {
      try {
        mod.configureMonacoYaml(monaco, {
          schemas: [
            {
              uri: "https://kestra.io/task-schema.json",
              fileMatch: [String(model.uri)],
              schema: KESTRA_TASK_SCHEMA,
            },
          ],
          validate: true,
        });
      } catch {
        // already configured
      }
    })
    .catch(() => {
      // monaco-yaml not available
    });

  // 2. Custom business validation
  const validate = () => {
    const markers: Monaco.editor.IMarkerData[] = [];
    const text = model.getValue();
    const lines = text.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Check input references: {{ inputs.xxx }}
      const inputRefs = line.matchAll(/\{\{\s*inputs\.(\w+)\s*\}\}/g);
      for (const match of inputRefs) {
        const inputId = match[1];
        const inputExists = inputs.some((inp) => inp.id === inputId);
        if (!inputExists) {
          const col = line.indexOf(match[0]) + 1;
          markers.push({
            severity: monaco.MarkerSeverity.Error,
            message: `输入参数 "${inputId}" 未定义，请检查全局输入参数配置`,
            startLineNumber: lineNum,
            startColumn: col,
            endLineNumber: lineNum,
            endColumn: col + match[0].length,
            source: "业务校验",
          });
        }
      }

      // Check task type validity
      if (line.trim().startsWith("type:")) {
        const typeValue = line
          .replace(/^.*type:\s*"?/, "")
          .replace(/"?\s*$/, "")
          .trim();
        if (typeValue && !KNOWN_PLUGIN_TYPES.includes(typeValue)) {
          const col = line.indexOf(typeValue) + 1;
          markers.push({
            severity: monaco.MarkerSeverity.Warning,
            message: `未知的插件类型 "${typeValue}"，请确认是否正确`,
            startLineNumber: lineNum,
            startColumn: col,
            endLineNumber: lineNum,
            endColumn: col + typeValue.length,
            source: "业务校验",
          });
        }
      }

      // Check id format
      if (line.trim().startsWith("id:")) {
        const idValue = line
          .replace(/^.*id:\s*"?/, "")
          .replace(/"?\s*$/, "")
          .trim();
        if (idValue && !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(idValue)) {
          const col = line.indexOf(idValue) + 1;
          markers.push({
            severity: monaco.MarkerSeverity.Warning,
            message: `任务 ID "${idValue}" 建议使用字母开头、仅包含字母数字和横线`,
            startLineNumber: lineNum,
            startColumn: col,
            endLineNumber: lineNum,
            endColumn: col + idValue.length,
            source: "业务校验",
          });
        }
      }

      // Check timeout format (ISO 8601)
      if (line.trim().startsWith("timeout:")) {
        const val = line
          .replace(/^.*timeout:\s*"?/, "")
          .replace(/"?\s*$/, "")
          .trim();
        if (val && !val.startsWith("P")) {
          const col = line.indexOf(val) + 1;
          markers.push({
            severity: monaco.MarkerSeverity.Warning,
            message: `超时时间建议使用 ISO 8601 格式（如 PT1H 表示1小时）`,
            startLineNumber: lineNum,
            startColumn: col,
            endLineNumber: lineNum,
            endColumn: col + val.length,
            source: "业务校验",
          });
        }
      }

      // Check for empty required fields
      const trimmed = line.trim();
      if (trimmed === "id:" || trimmed === 'id: ""' || trimmed === "id: ''") {
        markers.push({
          severity: monaco.MarkerSeverity.Error,
          message: "任务 ID 不能为空",
          startLineNumber: lineNum,
          startColumn: 1,
          endLineNumber: lineNum,
          endColumn: line.length + 1,
          source: "业务校验",
        });
      }
      if (trimmed === "type:" || trimmed === 'type: ""' || trimmed === "type: ''") {
        markers.push({
          severity: monaco.MarkerSeverity.Error,
          message: "任务类型不能为空",
          startLineNumber: lineNum,
          startColumn: 1,
          endLineNumber: lineNum,
          endColumn: line.length + 1,
          source: "业务校验",
        });
      }
    }

    monaco.editor.setModelMarkers(model, "kestra-business", markers);
  };

  // Run validation on content change
  const disposable = model.onDidChangeContent(() => {
    setTimeout(validate, 300); // debounce
  });

  // Initial validation
  validate();

  return disposable;
}

// Validate task config and return status for node display
export function validateTaskConfig(
  taskConfig: string,
  inputs: KestraInput[],
): { status: "ok" | "warning" | "error"; messages: string[] } {
  const messages: string[] = [];
  let worstStatus: "ok" | "warning" | "error" = "ok";

  const lines = taskConfig.split("\n");

  for (const line of lines) {
    // Input references
    for (const match of line.matchAll(/\{\{\s*inputs\.(\w+)\s*\}\}/g)) {
      const inputId = match[1];
      if (!inputs.some((inp) => inp.id === inputId)) {
        messages.push(`未定义的输入参数: ${inputId}`);
        worstStatus = "error";
      }
    }

    // Task type
    if (line.trim().startsWith("type:")) {
      const val = line
        .replace(/^.*type:\s*"?/, "")
        .replace(/"?\s*$/, "")
        .trim();
      if (val && !KNOWN_PLUGIN_TYPES.includes(val)) {
        messages.push(`未知插件类型: ${val}`);
        if (worstStatus === "ok") worstStatus = "warning";
      }
    }

    // ID format
    if (line.trim().startsWith("id:")) {
      const val = line
        .replace(/^.*id:\s*"?/, "")
        .replace(/"?\s*$/, "")
        .trim();
      if (!val) {
        messages.push("任务 ID 不能为空");
        worstStatus = "error";
      } else if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(val)) {
        messages.push(`ID 格式建议: ${val}`);
        if (worstStatus === "ok") worstStatus = "warning";
      }
    }

    // Empty type
    if (line.trim() === "type:" || line.trim() === 'type: ""') {
      messages.push("任务类型不能为空");
      worstStatus = "error";
    }
  }

  return { status: worstStatus, messages };
}
