/**
 * InputValuesForm.tsx — 执行输入表单
 *
 * 测试运行前弹出，让用户填写 input 值
 */

import { useState, useCallback } from "react";
import type { WorkflowInput } from "@/types/workflow";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface InputValuesFormProps {
  inputs: WorkflowInput[];
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
}

export function InputValuesForm({ inputs, onSubmit, onCancel }: InputValuesFormProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [multiValues, setMultiValues] = useState<Record<string, string[]>>({});

  const handleChange = useCallback((id: string, value: string) => {
    setValues((prev) => ({ ...prev, [id]: value }));
  }, []);

  const handleMultiToggle = useCallback((id: string, option: string) => {
    setMultiValues((prev) => {
      const current = prev[id] ?? [];
      const next = current.includes(option)
        ? current.filter((v) => v !== option)
        : [...current, option];
      return { ...prev, [id]: next };
    });
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const merged: Record<string, string> = { ...values };
      for (const input of inputs) {
        if (input.type === "MULTISELECT") {
          const selected = multiValues[input.id] ?? [];
          if (input.required && selected.length === 0) {
            toast.error(
              `请填写必填字段：${inputs
                .filter((i) => i.required && !multiValues[i.id]?.length)
                .map((i) => i.displayName || i.id)
                .join("、")}`,
            );
            return;
          }
          merged[input.id] = selected.join(",");
        }
      }
      const missing = inputs.filter((i) => i.required && i.type !== "MULTISELECT" && !merged[i.id]);
      if (missing.length > 0) {
        toast.error(`请填写必填字段：${missing.map((i) => i.displayName || i.id).join("、")}`);
        return;
      }
      onSubmit(merged);
    },
    [values, multiValues, onSubmit, inputs],
  );

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>▶ 运行测试</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {inputs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              该工作流没有定义输入参数，点击运行直接执行。
            </p>
          ) : (
            inputs.map((input) => (
              <div key={input.id} className="space-y-1">
                <Label className="text-xs font-medium">
                  {input.displayName || input.id}
                  {input.required && <span className="text-red-500 ml-1">*</span>}
                </Label>
                {input.description && (
                  <p className="text-xs text-muted-foreground">{input.description}</p>
                )}
                {input.type === "SELECT" ? (
                  <Select
                    value={values[input.id] ?? ""}
                    onValueChange={(value) => handleChange(input.id, value ?? "")}
                  >
                    <SelectTrigger className="text-sm mt-1">
                      <SelectValue placeholder="请选择..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(input.values ?? []).map((v) => (
                        <SelectItem key={v} value={v}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : input.type === "MULTISELECT" ? (
                  <div className="mt-1 space-y-1.5 rounded-md border border-input p-2.5">
                    {(input.values ?? []).map((v) => (
                      <label key={v} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={(multiValues[input.id] ?? []).includes(v)}
                          onCheckedChange={() => handleMultiToggle(input.id, v)}
                        />
                        {v}
                      </label>
                    ))}
                    {(!input.values || input.values.length === 0) && (
                      <p className="text-xs text-muted-foreground">无可选项</p>
                    )}
                  </div>
                ) : input.type === "BOOL" ? (
                  <Select
                    value={values[input.id] ?? ""}
                    onValueChange={(value) => handleChange(input.id, value ?? "")}
                  >
                    <SelectTrigger className="text-sm mt-1">
                      <SelectValue placeholder="请选择..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">true</SelectItem>
                      <SelectItem value="false">false</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type={input.type === "INT" || input.type === "FLOAT" ? "number" : "text"}
                    value={values[input.id] ?? ""}
                    onChange={(e) => handleChange(input.id, e.target.value)}
                    required={input.required}
                    placeholder={
                      input.defaults != null
                        ? typeof input.defaults === "string"
                          ? input.defaults
                          : JSON.stringify(input.defaults)
                        : ""
                    }
                    className="text-sm mt-1"
                  />
                )}
              </div>
            ))
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel} size="sm">
              取消
            </Button>
            <Button type="submit" size="sm">
              ▶ 运行
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
