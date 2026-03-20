import { useEffect, useCallback } from "react"
import Editor from "@monaco-editor/react"
import type * as Monaco from "monaco-editor"
import type { KestraInput } from "@/types/kestra"
import { setupYamlValidation } from "@/lib/yamlValidation"

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

  useEffect(() => {
    const id = "task-config-panel-styles"
    if (document.getElementById(id)) return
    const style = document.createElement("style")
    style.id = id
    style.textContent = `
      .panel-enter { animation: slideIn 0.2s ease-out; }
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `
    document.head.appendChild(style)
  }, [])

  return (
    <div className="panel-enter fixed top-0 right-0 h-screen w-full md:w-[480px] bg-card border-l border-border shadow-xl z-50 flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚙️</span>
          <h2 className="text-base font-semibold">任务配置</h2>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <div>
          <label className="text-sm font-medium text-foreground block mb-1.5">任务名称</label>
          <input
            type="text"
            value={label}
            onChange={handleLabelChange}
            placeholder="给这个任务起个名字"
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
          <label className="text-sm font-medium text-foreground block mb-1.5">任务 YAML 配置</label>
          <div className="rounded-md border border-input overflow-hidden">
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
    </div>
  )
}
