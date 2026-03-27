import { useState, useEffect } from "react";
import type { KestraInput } from "@/types/kestra";
import { Download, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface InputConfigPanelProps {
  inputs: KestraInput[];
  onUpdate: (inputs: KestraInput[]) => void;
  onClose: () => void;
}

const INPUT_TYPES = ["STRING", "INT", "FLOAT", "BOOL", "JSON", "URI", "DATE"];

export function InputConfigPanel({ inputs, onUpdate, onClose }: InputConfigPanelProps) {
  const [editingInputs, setEditingInputs] = useState<KestraInput[]>(inputs);

  useEffect(() => {
    setEditingInputs(inputs);
  }, [inputs]);

  const handleUpdate = (index: number, field: keyof KestraInput, value: string | boolean) => {
    const updated = [...editingInputs];
    updated[index] = { ...updated[index], [field]: value };
    setEditingInputs(updated);
    onUpdate(updated);
  };

  const handleAdd = () => {
    const newInput: KestraInput = {
      id: `input_${editingInputs.length + 1}`,
      type: "STRING",
      description: "",
    };
    const updated = [...editingInputs, newInput];
    setEditingInputs(updated);
    onUpdate(updated);
  };

  const handleRemove = (index: number) => {
    const updated = editingInputs.filter((_, i) => i !== index);
    setEditingInputs(updated);
    onUpdate(updated);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b">
        <Download className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium flex-1">全局输入参数</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 p-4">
        {editingInputs.map((input, index) => (
          <div key={index} className="border border-border rounded-lg p-4 space-y-3 relative group">
            <button
              onClick={() => handleRemove(index)}
              className="absolute top-2 right-2 w-6 h-6 rounded-full bg-destructive/10 text-destructive text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            >
              ✕
            </button>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">参数 ID</Label>
                <Input
                  value={input.id}
                  onChange={(e) => handleUpdate(index, "id", e.target.value)}
                  className="font-mono text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">类型</Label>
                <Select
                  value={input.type}
                  onValueChange={(value) => handleUpdate(index, "type", value ?? "")}
                >
                  <SelectTrigger className="text-sm mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INPUT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">默认值</Label>
              <Input
                value={input.defaults || ""}
                onChange={(e) => handleUpdate(index, "defaults", e.target.value)}
                placeholder="可选"
                className="text-sm mt-1"
              />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">描述</Label>
              <Input
                value={input.description || ""}
                onChange={(e) => handleUpdate(index, "description", e.target.value)}
                placeholder="参数说明"
                className="text-sm mt-1"
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id={`req-${index}`}
                checked={input.required || false}
                onCheckedChange={(checked) => handleUpdate(index, "required", checked)}
              />
              <Label htmlFor={`req-${index}`} className="text-xs text-muted-foreground">
                必填
              </Label>
            </div>
          </div>
        ))}

        <Button
          variant="ghost"
          onClick={handleAdd}
          className="w-full py-2.5 border-2 border-dashed border-muted-foreground/30 hover:border-indigo-400 hover:text-indigo-500"
        >
          + 添加输入参数
        </Button>
      </div>
    </div>
  );
}
