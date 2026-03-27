import { useCallback, useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import type { KestraInput } from "@/types/kestra";
import { setupYamlValidation } from "@/lib/yamlValidation";
import { Settings, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface TaskConfigPanelProps {
  nodeId: string;
  label: string;
  taskConfig: string;
  inputs: KestraInput[];
  onUpdate: (nodeId: string, label: string, taskConfig: string) => void;
  onClose: () => void;
}

const DEBOUNCE_MS = 500;

export function TaskConfigPanel({
  nodeId,
  label,
  taskConfig,
  inputs,
  onUpdate,
  onClose,
}: TaskConfigPanelProps) {
  // Local draft state — avoids creating a zustand-travel snapshot on every keystroke
  const [localValue, setLocalValue] = useState(taskConfig);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Flush pending debounce and immediately push the latest value to the store
  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined as ReturnType<typeof setTimeout> | undefined;
    }
    onUpdate(nodeId, label, localValue);
  }, [nodeId, label, localValue, onUpdate]);

  // When the external taskConfig prop changes (e.g. switching selected node),
  // flush any pending update for the previous node and reset local state.
  const prevNodeIdRef = useRef(nodeId);
  useEffect(() => {
    if (prevNodeIdRef.current !== nodeId) {
      // The previous node's pending value was already synced via the debounce
      // timer or will be lost if the user switched before it fired — that's
      // acceptable because the store already has the last-committed value.
      prevNodeIdRef.current = nodeId;
    }
    setLocalValue(taskConfig);
  }, [nodeId, taskConfig]);

  // Debounce: push localValue to the store after the user stops typing
  useEffect(() => {
    if (localValue === taskConfig) return; // no divergence → nothing to push
    timerRef.current = setTimeout(() => {
      onUpdate(nodeId, label, localValue);
      timerRef.current = undefined as ReturnType<typeof setTimeout> | undefined;
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [localValue, taskConfig, nodeId, label, onUpdate]);

  // Flush on close so the latest edits aren't lost
  const handleClose = useCallback(() => {
    flush();
    onClose();
  }, [flush, onClose]);

  const handleLabelChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdate(nodeId, e.target.value, localValue);
    },
    [nodeId, localValue, onUpdate],
  );

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      setLocalValue(value);
    }
  }, []);

  const handleMount = useCallback(
    (editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => {
      const model = editor.getModel();
      if (!model) return;

      // 1. Input parameter completion
      monaco.languages.registerCompletionItemProvider("yaml", {
        triggerCharacters: ["{", '"'],
        provideCompletionItems(m, position) {
          const lineContent = m.getLineContent(position.lineNumber);
          const textBefore = lineContent.substring(0, position.column - 1);

          if (!textBefore.includes("{{")) {
            const range = {
              startLineNumber: position.lineNumber,
              startColumn: position.column,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            };
            return {
              suggestions: inputs.map((input) => ({
                label: `{{ inputs.${input.id} }}`,
                kind: monaco.languages.CompletionItemKind.Variable,
                insertText: `{{ inputs.${input.id} }}`,
                detail: input.description || `${input.type} 参数`,
                documentation: `引用全局输入参数: ${input.id}${input.defaults ? `\n默认值: ${input.defaults}` : ""}`,
                range,
                sortText: input.id,
                filterText: `${input.id} inputs ${input.description || ""}`,
              })),
            };
          }

          return {
            suggestions: inputs.map((input) => ({
              label: `inputs.${input.id}`,
              kind: monaco.languages.CompletionItemKind.Variable,
              insertText: `inputs.${input.id} }}`,
              detail: input.description || `${input.type} 参数`,
              documentation: `引用全局输入参数: ${input.id}`,
              range: {
                startLineNumber: position.lineNumber,
                startColumn: position.column,
                endLineNumber: position.lineNumber,
                endColumn: position.column,
              },
            })),
          };
        },
      });

      // 2. YAML validation (schema + business)
      setupYamlValidation(monaco, model, inputs);
    },
    [inputs],
  );

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b">
        <Settings className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium flex-1">任务配置</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-5 p-4">
        <div>
          <Label className="text-sm font-medium">任务名称</Label>
          <Input
            value={label}
            onChange={handleLabelChange}
            placeholder="给这个任务起个名字"
            className="mt-1.5"
          />
        </div>

        {inputs.length > 0 && (
          <div className="bg-muted/50 rounded-md p-3">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">
              可引用的全局输入参数：
            </p>
            <div className="flex flex-wrap gap-1.5">
              {inputs.map((input) => (
                <span
                  key={input.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-xs font-mono"
                >
                  {`{{ inputs.${input.id} }}`}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 flex flex-col min-h-0">
          <Label className="text-sm font-medium">任务 YAML 配置</Label>
          <div className="rounded-md border border-input overflow-hidden mt-1.5 flex-1 min-h-[300px]">
            <Editor
              height="100%"
              language="yaml"
              theme="vs"
              value={localValue}
              onChange={handleEditorChange}
              onMount={handleMount}
              options={{
                fontSize: 13,
                lineHeight: 22,
                minimap: { enabled: false },
                padding: { top: 12 },
                scrollBeyondLastLine: false,
                wordWrap: "on",
                automaticLayout: true,
                tabSize: 2,
                suggest: { showIcons: true, preview: true },
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            输入 <code className="bg-muted px-1 rounded font-mono">{`{{`}</code> 触发输入参数补全 ·
            编辑器会自动校验 YAML 结构和业务规则
          </p>
        </div>
      </div>
    </div>
  );
}
