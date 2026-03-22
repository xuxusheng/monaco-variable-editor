import { useState, useEffect } from "react"
import { useNavigate } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useWorkflowStore } from "@/stores/workflow"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { toast } from "sonner"
import { Workflow } from "lucide-react"

export default function SetupPage() {
  const navigate = useNavigate()
  const setCurrentNamespace = useWorkflowStore((s) => s.setCurrentNamespace)
  const setHasNamespaces = useWorkflowStore((s) => s.setHasNamespaces)
  const hasNamespaces = useWorkflowStore((s) => s.hasNamespaces)

  // 如果已有 namespace，重定向到 /workflows
  useEffect(() => {
    if (hasNamespaces) {
      navigate({ to: "/workflows" })
    }
  }, [hasNamespaces, navigate])

  const [name, setName] = useState("")
  const [kestraNamespace, setKestraNamespace] = useState("")

  const createNamespace = trpc.namespace.create.useMutation({
    onSuccess: (result) => {
      setCurrentNamespace(result.id)
      setHasNamespaces(true)
      toast.success("项目空间创建成功")
      navigate({ to: "/workflows" })
    },
    onError: (err) => {
      toast.error(err.message || "创建失败")
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error("请输入空间名称")
      return
    }
    createNamespace.mutate({
      name: name.trim(),
      kestraNamespace: kestraNamespace.trim() || name.trim(),
    })
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-md border-0 shadow-lg">
        <CardContent className="pt-8 pb-8 px-8">
          <form onSubmit={handleSubmit} className="flex flex-col items-center gap-6">
            {/* Logo */}
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2">
                <Workflow className="size-8 text-primary" />
                <span className="text-2xl font-bold">Weave</span>
              </div>
              <p className="text-sm text-muted-foreground">
                可视化工作流编排平台
              </p>
            </div>

            {/* Description */}
            <div className="text-center space-y-1">
              <h2 className="text-lg font-medium">创建您的第一个项目空间</h2>
              <p className="text-sm text-muted-foreground">
                项目空间是您团队组织工作流的单元。
                <br />
                每个空间独立管理自己的工作流、密钥和变量。
              </p>
            </div>

            {/* Form fields */}
            <div className="w-full space-y-4">
              <div className="space-y-2">
                <label htmlFor="ns-name" className="text-sm font-medium">
                  空间名称
                </label>
                <Input
                  id="ns-name"
                  placeholder="例如：my-project"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="kestra-ns" className="text-sm font-medium">
                  Kestra Namespace（可选）
                </label>
                <Input
                  id="kestra-ns"
                  placeholder="留空将自动映射"
                  value={kestraNamespace}
                  onChange={(e) => setKestraNamespace(e.target.value)}
                />
              </div>
            </div>

            {/* Submit */}
            <Button
              type="submit"
              className="w-full"
              disabled={createNamespace.isPending}
            >
              {createNamespace.isPending ? "创建中…" : "创建并进入"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
