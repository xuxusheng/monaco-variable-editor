import { useState } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { Button } from "@/components/ui/button"
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
import { Plus, Trash2, Workflow, GitBranch, Clock } from "lucide-react"
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

export default function WorkflowListPage() {
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const { data: workflows, isLoading } = trpc.workflow.list.useQuery()
  const createWorkflow = trpc.workflow.create.useMutation({
    onSuccess: (result) => {
      utils.workflow.list.invalidate()
      navigate({ to: "/workflows/$workflowId/edit", params: { workflowId: result.id } })
    },
    onError: () => toast.error("创建工作流失败"),
  })
  const deleteWorkflow = trpc.workflow.delete.useMutation({
    onSuccess: () => {
      toast.success("工作流已删除")
      utils.workflow.list.invalidate()
    },
    onError: () => toast.error("删除失败"),
  })

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const handleCreate = () => {
    createWorkflow.mutate({
      name: "新建工作流",
      flowId: `new-flow-${Date.now()}`,
      namespaceId: "default",
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

        {isLoading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        )}

        {!isLoading && workflows?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Workflow className="mb-4 h-12 w-12" />
            <p className="text-lg">暂无工作流</p>
            <p className="text-sm">点击右上角「新建工作流」开始创建</p>
          </div>
        )}

        {workflows && workflows.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {workflows.map((wf) => (
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
                    <CardAction>
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
                  <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
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
