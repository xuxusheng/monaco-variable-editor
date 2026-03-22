import { useState, useMemo, useEffect } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useWorkflowStore } from "@/stores/workflow"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
} from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"
import {
  Plus,
  Trash2,
  Workflow,
  GitBranch,
  Clock,
  Search,
  Timer,
  Webhook,
  CheckCircle2,
  XCircle,
  Loader2,
  Zap,
} from "lucide-react"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"

function formatDate(date: Date | string) {
  const d = new Date(date)
  return d.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso)
  const now = Date.now()
  const diffMs = now - date.getTime()
  const absDiff = Math.abs(diffMs)

  if (absDiff < 60_000) return "刚刚"

  const minutes = Math.floor(absDiff / 60_000)
  if (minutes < 60) return `${minutes} 分钟前`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`

  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`

  return date.toLocaleDateString("zh-CN")
}

function StateIcon({ state }: { state: string }) {
  if (state === "SUCCESS") return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
  if (state === "FAILED" || state === "KILLED" || state === "CANCELLED")
    return <XCircle className="h-3.5 w-3.5 text-red-500" />
  if (state === "RUNNING" || state === "CREATED" || state === "RESTARTED")
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
  return <Zap className="h-3.5 w-3.5 text-muted-foreground" />
}

function stateLabel(state: string): string {
  switch (state) {
    case "SUCCESS":
      return "成功"
    case "FAILED":
      return "失败"
    case "KILLED":
      return "已终止"
    case "CANCELLED":
      return "已取消"
    case "RUNNING":
      return "运行中"
    case "CREATED":
      return "已创建"
    case "RESTARTED":
      return "已重启"
    default:
      return state
  }
}

type StatusFilter = "all" | "draft" | "published"

export default function WorkflowListPage() {
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const hasNamespaces = useWorkflowStore((s) => s.hasNamespaces)
  const { data: workflows, isLoading } = trpc.workflow.listEnriched.useQuery()

  // 没有 namespace 时引导到 setup 页
  useEffect(() => {
    if (!hasNamespaces) {
      navigate({ to: "/setup" })
    }
  }, [hasNamespaces, navigate])
  const createWorkflow = trpc.workflow.create.useMutation({
    onSuccess: (result) => {
      utils.workflow.listEnriched.invalidate()
      navigate({ to: "/workflows/$workflowId/edit", params: { workflowId: result.id } })
    },
    onError: () => toast.error("创建工作流失败"),
  })
  const deleteWorkflow = trpc.workflow.delete.useMutation({
    onSuccess: () => {
      toast.success("工作流已删除")
      utils.workflow.listEnriched.invalidate()
    },
    onError: () => toast.error("删除失败"),
  })

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")

  const filteredWorkflows = useMemo(() => {
    if (!workflows) return []
    return workflows.filter((wf) => {
      // Status filter
      if (statusFilter === "draft" && wf.publishedVersion > 0) return false
      if (statusFilter === "published" && wf.publishedVersion === 0) return false

      // Search filter
      if (search) {
        const q = search.toLowerCase()
        if (!wf.name.toLowerCase().includes(q) && !wf.flowId.toLowerCase().includes(q)) {
          return false
        }
      }

      return true
    })
  }, [workflows, search, statusFilter])

  const currentNamespace = useWorkflowStore((s) => s.currentNamespace)

  const handleCreate = () => {
    createWorkflow.mutate({
      name: "新建工作流",
      flowId: `new-flow-${Date.now()}`,
      namespaceId: currentNamespace!,
    })
  }

  const handleDelete = () => {
    if (deleteTarget) {
      deleteWorkflow.mutate({ id: deleteTarget })
      setDeleteTarget(null)
    }
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">工作流</h1>
          <Button onClick={handleCreate} disabled={createWorkflow.isPending}>
            <Plus className="mr-1.5 h-4 w-4" />
            新建工作流
          </Button>
        </div>

        {/* Search & Filter */}
        <div className="mb-4 flex items-center gap-3">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索名称或 Flow ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-1">
            {(["all", "draft", "published"] as StatusFilter[]).map((key) => (
              <Button
                key={key}
                variant={statusFilter === key ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setStatusFilter(key)}
                className="text-xs"
              >
                {key === "all" ? "全部" : key === "draft" ? "草稿" : "已发布"}
              </Button>
            ))}
          </div>
        </div>

        {isLoading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        )}

        {!isLoading && filteredWorkflows?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Workflow className="mb-4 h-12 w-12" />
            <p className="text-lg">{workflows?.length === 0 ? "暂无工作流" : "无匹配结果"}</p>
            <p className="text-sm">
              {workflows?.length === 0
                ? "点击右上角「新建工作流」开始创建"
                : "尝试调整搜索条件或筛选器"}
            </p>
          </div>
        )}

        {filteredWorkflows && filteredWorkflows.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredWorkflows.map((wf) => (
              <Card key={wf.id} className="group relative transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="truncate">
                        <Link
                          to="/workflows/$workflowId/edit"
                          params={{ workflowId: wf.id }}
                          className="hover:underline"
                        >
                          {wf.name}
                        </Link>
                      </CardTitle>
                      <CardDescription className="mt-1 flex items-center gap-1 text-xs">
                        <GitBranch className="h-3 w-3" />
                        {wf.flowId}
                      </CardDescription>
                    </div>
                    <CardAction className="flex items-center gap-1.5">
                      {wf.publishedVersion > 0 ? (
                        <Badge variant="default" className="gap-0.5 bg-green-500/15 text-green-700 dark:text-green-400">
                          已发布 v{wf.publishedVersion}
                        </Badge>
                      ) : (
                        <Badge variant="outline">草稿</Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={(e) => {
                          e.preventDefault()
                          setDeleteTarget(wf.id)
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </CardAction>
                  </div>

                  {/* Triggers */}
                  {wf.triggers.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {wf.triggers.map((trigger) => (
                        <Badge
                          key={trigger.id}
                          variant="secondary"
                          className="gap-0.5 font-normal"
                        >
                          {trigger.type === "schedule" ? (
                            <Timer className="h-3 w-3" />
                          ) : (
                            <Webhook className="h-3 w-3" />
                          )}
                          {trigger.name}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Last execution */}
                  {wf.lastExecution && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs">
                      <StateIcon state={wf.lastExecution.state} />
                      <span className="text-muted-foreground">
                        {stateLabel(wf.lastExecution.state)} · {formatRelativeTime(wf.lastExecution.createdAt)}
                      </span>
                    </div>
                  )}

                  {/* Updated at */}
                  <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatDate(wf.updatedAt)}
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              此操作不可撤销，工作流及其所有草稿和发布版本将被永久删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
