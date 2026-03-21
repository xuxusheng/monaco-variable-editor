/**
 * TriggerCreateForm — 创建触发器对话框
 * 支持 Schedule / Webhook 两种类型
 */

import { useState, useCallback } from "react"
import { trpc } from "@/lib/trpc"
import { toast } from "sonner"
import { Zap, RefreshCw } from "lucide-react"

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-card rounded-lg shadow-xl w-full max-w-md border border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4" />
            <h2 className="text-base font-semibold">创建触发器</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
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

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm bg-muted hover:bg-muted/80 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={createTrigger.isPending}
            className="px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {createTrigger.isPending ? "创建中..." : "创建"}
          </button>
        </div>
      </div>
    </div>
  )
}
