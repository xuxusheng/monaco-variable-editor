/**
 * TriggerCreateForm — 创建触发器对话框
 * 支持 Schedule / Webhook 两种类型
 */

import { useCallback, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Zap, RefreshCw, Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const triggerFormSchema = z.object({
  name: z.string().min(1, "请输入触发器名称"),
  type: z.enum(["schedule", "webhook"]),
  cron: z.string().optional(),
  timezone: z.string().optional(),
  webhookSecret: z.string().optional(),
  selectedReleaseId: z.string().min(1, "请选择一个版本"),
  triggerInputs: z.array(
    z.object({
      key: z.string().min(1),
      value: z.string(),
    }),
  ),
});

type TriggerFormData = z.infer<typeof triggerFormSchema>;

interface TriggerCreateFormProps {
  workflowId: string;
  releases: { id: string; version: number; name: string }[];
  onClose: () => void;
  onCreated: () => void;
}

export function TriggerCreateForm({
  workflowId,
  releases,
  onClose,
  onCreated,
}: TriggerCreateFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<TriggerFormData>({
    resolver: zodResolver(triggerFormSchema),
    defaultValues: {
      name: "",
      type: "schedule",
      cron: "0 9 * * *",
      timezone: "Asia/Shanghai",
      webhookSecret: crypto.randomUUID(),
      selectedReleaseId: releases[0]?.id ?? "",
      triggerInputs: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "triggerInputs",
  });

  const type = watch("type");
  const webhookSecret = watch("webhookSecret");

  const createTrigger = trpc.workflowTrigger.create.useMutation({
    onSuccess: () => {
      toast.success("触发器创建成功");
      onCreated();
      onClose();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const regenerateSecret = useCallback(() => {
    setValue("webhookSecret", crypto.randomUUID());
  }, [setValue]);

  const onSubmit = useCallback(
    (data: TriggerFormData) => {
      const config =
        data.type === "schedule"
          ? ({
              cron: (data.cron ?? "").trim(),
              timezone: data.timezone ?? "Asia/Shanghai",
            } as const)
          : ({ secret: data.webhookSecret ?? crypto.randomUUID() } as const);

      createTrigger.mutate({
        workflowId,
        name: data.name.trim(),
        type: data.type,
        config,
        releaseId: data.selectedReleaseId,
        inputs:
          data.triggerInputs.length > 0
            ? Object.fromEntries(data.triggerInputs.map((i) => [i.key, i.value]))
            : undefined,
      });
    },
    [workflowId, createTrigger],
  );

  useEffect(() => {
    if (errors.name) toast.error(errors.name.message);
    if (errors.selectedReleaseId) toast.error(errors.selectedReleaseId.message);
    if (errors.cron) toast.error(errors.cron.message);
  }, [errors]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-4 h-4" />
            创建触发器
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label className="mb-1.5">触发器名称</Label>
            <Input {...register("name")} placeholder="每日定时触发" />
          </div>

          <div>
            <Label className="mb-1.5">类型</Label>
            <RadioGroup
              value={type}
              onValueChange={(v) => setValue("type", v as "schedule" | "webhook")}
              className="flex gap-4"
            >
              <Label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="schedule" />
                Schedule
              </Label>
              <Label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="webhook" />
                Webhook
              </Label>
            </RadioGroup>
          </div>

          {type === "schedule" && (
            <div className="space-y-3 border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground">Schedule 配置</p>
              <div>
                <Label className="mb-1.5">Cron</Label>
                <Input {...register("cron")} placeholder="0 9 * * *" />
              </div>
              <div>
                <Label className="mb-1.5">时区</Label>
                <Input {...register("timezone")} placeholder="Asia/Shanghai" />
              </div>
            </div>
          )}

          {type === "webhook" && (
            <div className="space-y-3 border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground">Webhook 配置</p>
              <div>
                <Label className="mb-1.5">Secret</Label>
                <div className="flex gap-2">
                  <Input value={webhookSecret} readOnly className="font-mono bg-muted" />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={regenerateSecret}
                    title="重新生成"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div>
            <Label className="mb-1.5">基于版本</Label>
            <Select
              value={watch("selectedReleaseId")}
              onValueChange={(v) => {
                if (v) setValue("selectedReleaseId", v);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {releases.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    v{r.version} {r.name ? `"${r.name}"` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3 border-t border-border pt-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">触发器输入参数</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => append({ key: "", value: "" })}
                className="h-6 text-xs"
              >
                <Plus className="w-3 h-3 mr-1" />
                添加
              </Button>
            </div>
            {fields.map((field, index) => (
              <div key={field.id} className="flex gap-2">
                <Input
                  {...register(`triggerInputs.${index}.key`)}
                  placeholder="参数名"
                  className="flex-1"
                />
                <Input
                  {...register(`triggerInputs.${index}.value`)}
                  placeholder="参数值"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(index)}
                  className="shrink-0 h-9 w-9 text-muted-foreground hover:text-destructive"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={createTrigger.isPending}>
              {createTrigger.isPending ? "创建中..." : "创建"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
