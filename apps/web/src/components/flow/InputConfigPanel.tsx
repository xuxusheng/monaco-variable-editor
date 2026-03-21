import { useState } from "react"
import type { KestraInput } from "@/types/kestra"
import { Download } from "lucide-react"

interface InputConfigPanelProps {
  inputs: KestraInput[]
  onUpdate: (inputs: KestraInput[]) => void
  onClose: () => void
}

const INPUT_TYPES = ["STRING", "INT", "FLOAT", "BOOL", "JSON", "URI", "DATE"]

export function InputConfigPanel({ inputs, onUpdate, onClose }: InputConfigPanelProps) {
  const [editingInputs, setEditingInputs] = useState<KestraInput[]>(inputs)

  const handleUpdate = (index: number, field: keyof KestraInput, value: string | boolean) => {
    const updated = [...editingInputs]
    updated[index] = { ...updated[index], [field]: value }
    setEditingInputs(updated)
    onUpdate(updated)
  }

  const handleAdd = () => {
    const newInput: KestraInput = {
      id: `input_${editingInputs.length + 1}`,
      type: "STRING",
      description: "",
    }
    const updated = [...editingInputs, newInput]
    setEditingInputs(updated)
    onUpdate(updated)
  }

  const handleRemove = (index: number) => {
    const updated = editingInputs.filter((_, i) => i !== index)
    setEditingInputs(updated)
    onUpdate(updated)
  }

  return (
    <div className="panel-enter fixed top-0 right-0 h-screen w-full md:w-[480px] bg-card border-l border-border shadow-xl z-50 flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-lg"><Download className="w-4 h-4" /></span>
          <h2 className="text-base font-semibold">全局输入参数</h2>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {editingInputs.map((input, index) => (
          <div
            key={index}
            className="border border-border rounded-lg p-4 space-y-3 relative group"
          >
            <button
              onClick={() => handleRemove(index)}
              className="absolute top-2 right-2 w-6 h-6 rounded-full bg-destructive/10 text-destructive text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            >
              ✕
            </button>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  参数 ID
                </label>
                <input
                  type="text"
                  value={input.id}
                  onChange={(e) => handleUpdate(index, "id", e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  类型
                </label>
                <select
                  value={input.type}
                  onChange={(e) => handleUpdate(index, "type", e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {INPUT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                默认值
              </label>
              <input
                type="text"
                value={input.defaults || ""}
                onChange={(e) => handleUpdate(index, "defaults", e.target.value)}
                placeholder="可选"
                className="w-full px-2.5 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                描述
              </label>
              <input
                type="text"
                value={input.description || ""}
                onChange={(e) => handleUpdate(index, "description", e.target.value)}
                placeholder="参数说明"
                className="w-full px-2.5 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`req-${index}`}
                checked={input.required || false}
                onChange={(e) => handleUpdate(index, "required", e.target.checked)}
                className="rounded"
              />
              <label htmlFor={`req-${index}`} className="text-xs text-muted-foreground">
                必填
              </label>
            </div>
          </div>
        ))}

        <button
          onClick={handleAdd}
          className="w-full py-2.5 rounded-md border-2 border-dashed border-muted-foreground/30 text-sm text-muted-foreground hover:border-indigo-400 hover:text-indigo-500 transition-colors"
        >
          + 添加输入参数
        </button>
      </div>
    </div>
  )
}
