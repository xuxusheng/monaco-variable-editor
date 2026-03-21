/**
 * TriggerCreateForm — 创建触发器对话框
 * 支持 Schedule / Webhook 两种类型
 */

import { useState, useCallback } from "react"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"
import { Zap, RefreshCw } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface TriggerCreateFormProps {
  workflowId: string
  releases: { id: string; version: number; name: string }[]
  onClose: () => void
  onCreated: () => void
}

export function TriggerCreateForm({
  workflowId,
  releases,
  onClose,
  onCreated,
}: TriggerCreateFormProps) {
  const [name, setName] = useState("")
  const [type, setType] = useState<"schedule" | "webhook">("schedule")
  const [cron, setCron] = useState("0 9 * * *")
  const [timezone, setTimezone] = useState("Asia/Shanghai")
  const [webhookSecret, setWebhookSecret] = useState(
    () => crypto.randomUUID(),
  )
  const [selectedReleaseId, setSelectedReleaseId] = useState(
    releases[0]?.id ?? "",
  )

  const createTrigger = trpc.workflow.triggerCreate.useMutation({
    onSuccess: () => {
      toast.success("触发器创建成功")
      onCreated()
      onClose()
    },
    onError: (err) => {
      toast.error(err.message)
    },
  })

  const regenerateSecret = useCallback(() => {
    setWebhookSecret(crypto.randomUUID())
  }, [])

  const handleSubmit = useCallback(() => {
    if (!name.trim()) {
      toast.error("请输入触发器名称")
      return
    }
    if (type === "schedule" && !cron.trim()) {
      toast.error("请输入 Cron 表达式")
      return
    }
    if (!selectedReleaseId) {
      toast.error("请选择一个版本")
      return
    }

    const config: Record<string, unknown> =
      type === "schedule"
        ? { cron: cron.trim(), timezone }
        : { secret: webhookSecret }

    createTrigger.mutate({
      workflowId,
      name: name.trim(),
      type,
      config,
      releaseId: selectedReleaseId,
    })
  }, [
    name,
    type,
    cron,
    timezone,
    webhookSecret,
    selectedReleaseId,
    workflowId,
    createTrigger,
  ])

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
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
            <label className="block text-sm font-medium mb-1.5">
              触发器名称
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="每日定时触发"
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Type toggle */}
          <div>
            <label className="block text-sm font-medium mb-1.5">类型</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="trigger-type"
                  checked={type === "schedule"}
                  onChange={() => setType("schedule")}
                  className="accent-primary"
                />
                Schedule
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="trigger-type"
                  checked={type === "webhook"}
                  onChange={() => setType("webhook")}
                  className="accent-primary"
                />
                Webhook
              </label>
            </div>
          </div>

          {/* Schedule config */}
          {type === "schedule" && (
            <div className="space-y-3 border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground">
                Schedule 配置
              </p>
              <div>
                <label className="block text-sm mb-1.5">Cron</label>
                <input
                  type="text"
                  value={cron}
                  onChange={(e) => setCron(e.target.value)}
                  placeholder="0 9 * * *"
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm mb-1.5">时区</label>
                <input
                  type="text"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="Asia/Shanghai"
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          )}

          {/* Webhook config */}
          {type === "webhook" && (
            <div className="space-y-3 border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground">
                Webhook 配置
              </p>
              <div>
                <label className="block text-sm mb-1.5">Secret</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={webhookSecret}
                    readOnly
                    className="flex-1 px-3 py-2 rounded-md border border-input bg-muted text-sm font-mono"
                  />
                  <button
                    onClick={regenerateSecret}
                    className="px-3 py-2 rounded-md border border-input hover:bg-muted transition-colors"
                    title="重新生成"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Release selector */}
          <div>
            <label className="block text-sm font-medium mb-1.5">基于版本</label>
            <select
              value={selectedReleaseId}
              onChange={(e) => setSelectedReleaseId(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {releases.map((r) => (
                <option key={r.id} value={r.id}>
                  v{r.version} {r.name ? `"${r.name}"` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button
            onClick={handleSubmit}
            disabled={createTrigger.isPending}
          >
            {createTrigger.isPending ? "创建中..." : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
