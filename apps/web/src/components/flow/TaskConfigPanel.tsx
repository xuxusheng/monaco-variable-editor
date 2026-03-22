import { useCallback } from "react"
import Editor from "@monaco-editor/react"
import type * as Monaco from "monaco-editor"
import type { KestraInput } from "@/types/kestra"
import { setupYamlValidation } from "@/lib/yamlValidation"
import { Settings } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface TaskConfigPanelProps {
  nodeId: string
  label: string
  taskConfig: string
  inputs: KestraInput[]
  onUpdate: (nodeId: string, label: string, taskConfig: string) => void
  onClose: () => void
}

export function TaskConfigPanel({
  nodeId,
  label,
  taskConfig,
  inputs,
  onUpdate,
  onClose,
}: TaskConfigPanelProps) {
  const handleLabelChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdate(nodeId, e.target.value, taskConfig)
    },
    [nodeId, taskConfig, onUpdate],
  )

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined) {
        onUpdate(nodeId, label, value)
      }
    },
    [nodeId, label, onUpdate],
  )

  const handleMount = useCallback(
    (editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => {
      const model = editor.getModel()
      if (!model) return

      // 1. Input parameter completion
      monaco.languages.registerCompletionItemProvider("yaml", {
        triggerCharacters: ["{", '"'],
        provideCompletionItems(m, position) {
          const lineContent = m.getLineContent(position.lineNumber)
          const textBefore = lineContent.substring(0, position.column - 1)

          if (!textBefore.includes("{{")) {
            const range = {
              startLineNumber: position.lineNumber,
              startColumn: position.column,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            }
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
            }
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
          }
        },
      })

      // 2. YAML validation (schema + business)
      setupYamlValidation(monaco, model, inputs)
    },
    [inputs],
  )

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            任务配置
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 pr-1">
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
              <p className="text-xs font-medium text-muted-foreground mb-1.5">可引用的全局输入参数：</p>
              <div className="flex flex-wrap gap-1.5">
                {inputs.map((input) => (
                  <span key={input.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-xs font-mono">
                    {`{{ inputs.${input.id} }}`}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label className="text-sm font-medium">任务 YAML 配置</Label>
            <div className="rounded-md border border-input overflow-hidden mt-1.5">
              <Editor
                height="400px"
                language="yaml"
                theme="vs"
                value={taskConfig}
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
              输入 <code className="bg-muted px-1 rounded font-mono">{`{{`}</code> 触发输入参数补全 · 编辑器会自动校验 YAML 结构和业务规则
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
