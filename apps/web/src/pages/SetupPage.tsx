import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { trpc } from "@/lib/trpc";
import { useWorkflowStore } from "@/stores/workflow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { Workflow, Loader2, ChevronDown, ChevronUp } from "lucide-react";

export default function SetupPage() {
  const navigate = useNavigate();
  const setCurrentNamespace = useWorkflowStore((s) => s.setCurrentNamespace);
  const setHasNamespaces = useWorkflowStore((s) => s.setHasNamespaces);
  const hasNamespaces = useWorkflowStore((s) => s.hasNamespaces);

  // 如果已有 namespace，重定向到 /workflows
  useEffect(() => {
    if (hasNamespaces) {
      void navigate({ to: "/workflows" });
    }
  }, [hasNamespaces, navigate]);

  const [name, setName] = useState("");
  const [kestraNamespace, setKestraNamespace] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const createNamespace = trpc.namespace.create.useMutation({
    onSuccess: (result) => {
      setCurrentNamespace(result.id);
      setHasNamespaces(true);
      toast.success("项目空间创建成功");
      void navigate({ to: "/workflows" });
    },
    onError: (err) => {
      toast.error(err.message || "创建失败");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("请输入空间名称");
      return;
    }
    createNamespace.mutate({
      name: name.trim(),
      kestraNamespace: kestraNamespace.trim() || name.trim(),
    });
  };

  const isSubmitDisabled = !name.trim() || createNamespace.isPending;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-muted px-6">
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5">
              <Workflow className="size-7 text-primary" />
            </div>
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-3xl font-bold text-transparent">
              Weave
            </span>
          </div>
          <p className="text-sm text-muted-foreground">可视化工作流编排平台</p>
        </div>

        {/* Decorative divider */}
        <div className="mx-auto h-px w-16 bg-gradient-to-r from-transparent via-border to-transparent" />

        {/* Card */}
        <div className="rounded-xl border bg-card/50 p-8 shadow-lg backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Heading */}
            <div className="space-y-2 text-center">
              <h2 className="text-lg font-semibold tracking-tight">创建您的第一个项目空间</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                项目空间是您团队组织工作流的单元。
              </p>
            </div>

            {/* Form fields */}
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="ns-name" className="text-sm font-medium">
                  空间名称
                </label>
                <Input
                  id="ns-name"
                  placeholder="例如：数据团队"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  className="transition-shadow duration-200 focus-visible:ring-2 focus-visible:ring-primary/40"
                />
              </div>

              <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
                <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  {showAdvanced ? (
                    <ChevronUp className="size-4" />
                  ) : (
                    <ChevronDown className="size-4" />
                  )}
                  高级设置
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <div className="space-y-2">
                    <label htmlFor="kestra-ns" className="text-sm font-medium">
                      Kestra Namespace
                    </label>
                    <Input
                      id="kestra-ns"
                      value={kestraNamespace}
                      onChange={(e) => setKestraNamespace(e.target.value)}
                      className="transition-shadow duration-200 focus-visible:ring-2 focus-visible:ring-primary/40"
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>

            {/* Submit */}
            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-primary to-primary/80 shadow-md transition-all duration-200 hover:shadow-lg hover:brightness-110"
              disabled={isSubmitDisabled}
            >
              {createNamespace.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  创建中…
                </>
              ) : (
                "开始使用"
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
