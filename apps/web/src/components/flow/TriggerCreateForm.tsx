/**
 * TriggerCreateForm — 创建触发器对话框
 * 支持 Schedule / Webhook 两种类型
 */

import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Zap, RefreshCw } from "lucide-react";
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
  const [name, setName] = useState("");
  const [type, setType] = useState<"schedule" | "webhook">("schedule");
  const [cron, setCron] = useState("0 9 * * *");
  const [timezone, setTimezone] = useState("Asia/Shanghai");
  const [webhookSecret, setWebhookSecret] = useState(() => crypto.randomUUID());
  const [selectedReleaseId, setSelectedReleaseId] = useState(releases[0]?.id ?? "");

  const createTrigger = trpc.workflow.triggerCreate.useMutation({
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
    setWebhookSecret(crypto.randomUUID());
  }, []);

  const handleSubmit = useCallback(() => {
    if (!name.trim()) {
      toast.error("请输入触发器名称");
      return;
    }
    if (type === "schedule" && !cron.trim()) {
      toast.error("请输入 Cron 表达式");
      return;
    }
    if (!selectedReleaseId) {
      toast.error("请选择一个版本");
      return;
    }

    const config: Record<string, unknown> =
      type === "schedule" ? { cron: cron.trim(), timezone } : { secret: webhookSecret };

    createTrigger.mutate({
      workflowId,
      name: name.trim(),
      type,
      config,
      releaseId: selectedReleaseId,
    });
  }, [name, type, cron, timezone, webhookSecret, selectedReleaseId, workflowId, createTrigger]);

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

        {/* Body */}
        <div className="space-y-4">
          {/* Name */}
          <div>
            <Label className="mb-1.5">触发器名称</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="每日定时触发"
            />
          </div>

          {/* Type toggle */}
          <div>
            <Label className="mb-1.5">类型</Label>
            <RadioGroup
              value={type}
              onValueChange={(v) => setType(v as "schedule" | "webhook")}
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

          {/* Schedule config */}
          {type === "schedule" && (
            <div className="space-y-3 border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground">Schedule 配置</p>
              <div>
                <Label className="mb-1.5">Cron</Label>
                <Input
                  value={cron}
                  onChange={(e) => setCron(e.target.value)}
                  placeholder="0 9 * * *"
                />
              </div>
              <div>
                <Label className="mb-1.5">时区</Label>
                <Input
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="Asia/Shanghai"
                />
              </div>
            </div>
          )}

          {/* Webhook config */}
          {type === "webhook" && (
            <div className="space-y-3 border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground">Webhook 配置</p>
              <div>
                <Label className="mb-1.5">Secret</Label>
                <div className="flex gap-2">
                  <Input value={webhookSecret} readOnly className="font-mono bg-muted" />
                  <Button variant="outline" size="icon" onClick={regenerateSecret} title="重新生成">
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Release selector */}
          <div>
            <Label className="mb-1.5">基于版本</Label>
            <Select
              value={selectedReleaseId}
              onValueChange={(v) => {
                if (v) setSelectedReleaseId(v);
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={createTrigger.isPending}>
            {createTrigger.isPending ? "创建中..." : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
