import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { trpc } from "@/lib/trpc";
import { useWorkflowStore } from "@/stores/workflow";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  FilePlus,
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

function formatDate(date: Date | string) {
  const d = new Date(date);
  return d.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const absDiff = Math.abs(diffMs);

  if (absDiff < 60_000) return "刚刚";

  const minutes = Math.floor(absDiff / 60_000);
  if (minutes < 60) return `${minutes} 分钟前`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;

  return date.toLocaleDateString("zh-CN");
}

function StateIcon({ state }: { state: string }) {
  if (state === "SUCCESS") return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
  if (state === "FAILED" || state === "KILLED" || state === "CANCELLED")
    return <XCircle className="h-3.5 w-3.5 text-red-500" />;
  if (state === "RUNNING" || state === "CREATED" || state === "RESTARTED")
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />;
  return <Zap className="h-3.5 w-3.5 text-muted-foreground" />;
}

function stateLabel(state: string): string {
  switch (state) {
    case "SUCCESS":
      return "成功";
    case "FAILED":
      return "失败";
    case "KILLED":
      return "已终止";
    case "CANCELLED":
      return "已取消";
    case "RUNNING":
      return "运行中";
    case "CREATED":
      return "已创建";
    case "RESTARTED":
      return "已重启";
    default:
      return state;
  }
}

type StatusFilter = "all" | "draft";

interface WorkflowItem {
  id: string;
  name: string;
  flowId: string;
  namespaceId: string;
  disabled: boolean;
  publishedVersion: number;
  createdAt: Date;
  updatedAt: Date;
  triggers: Array<{
    id: string;
    name: string;
    type: string;
    config: unknown;
    disabled: boolean;
  }>;
  lastExecution: {
    state: string;
    triggeredBy: string;
    startedAt: string | null;
    endedAt: string | null;
    createdAt: string;
  } | null;
}

function WorkflowCard({
  workflow: wf,
  onNavigate,
  onDelete,
}: {
  workflow: WorkflowItem;
  onNavigate: ReturnType<typeof useNavigate>;
  onDelete: (id: string) => void;
}) {
  return (
    <Card
      className="group relative cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:ring-foreground/20"
      onClick={() =>
        onNavigate({ to: "/workflows/$workflowId/edit", params: { workflowId: wf.id } })
      }
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <CardTitle className="truncate pr-2 text-base">{wf.name}</CardTitle>
          <CardAction>
            {wf.publishedVersion > 0 ? (
              <Badge
                variant="default"
                className="gap-0.5 bg-green-500/15 text-green-700 dark:text-green-400"
              >
                v{wf.publishedVersion}
              </Badge>
            ) : (
              <Badge variant="outline">草稿</Badge>
            )}
          </CardAction>
        </div>
        <CardDescription className="flex items-center gap-1 text-xs">
          <GitBranch className="h-3 w-3" />
          {wf.flowId}
          {wf.disabled && (
            <Badge variant="secondary" className="ml-1 text-xs text-muted-foreground">
              已禁用
            </Badge>
          )}
        </CardDescription>
      </CardHeader>

      {(wf.triggers.length > 0 || wf.lastExecution) && (
        <CardContent className="space-y-2.5">
          {wf.triggers.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {wf.triggers.map((trigger) => (
                <Badge key={trigger.id} variant="secondary" className="gap-0.5 font-normal">
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

          {wf.lastExecution && (
            <div className="flex items-center gap-1.5 text-xs">
              <StateIcon state={wf.lastExecution.state} />
              <span className="text-muted-foreground">
                {stateLabel(wf.lastExecution.state)} ·{" "}
                {formatRelativeTime(wf.lastExecution.createdAt)}
              </span>
            </div>
          )}
        </CardContent>
      )}

      <CardFooter className="border-t bg-transparent p-0">
        <div className="flex w-full items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatDate(wf.updatedAt)}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground opacity-0 transition-all hover:text-destructive group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(wf.id);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

export default function WorkflowListPage() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const hasNamespaces = useWorkflowStore((s) => s.hasNamespaces);
  const currentNamespace = useWorkflowStore((s) => s.currentNamespace);
  const { data: workflows, isLoading } = trpc.workflow.listEnriched.useQuery(
    { namespaceId: currentNamespace ?? "" },
    { enabled: !!currentNamespace },
  );

  // 没有 namespace 时引导到 setup 页
  useEffect(() => {
    if (!hasNamespaces) {
      void navigate({ to: "/setup" });
    }
  }, [hasNamespaces, navigate]);
  const createWorkflow = trpc.workflow.create.useMutation({
    onSuccess: (result) => {
      void utils.workflow.listEnriched.invalidate();
      void navigate({ to: "/workflows/$workflowId/edit", params: { workflowId: result.id } });
    },
    onError: () => toast.error("创建工作流失败"),
  });
  const deleteWorkflow = trpc.workflow.delete.useMutation({
    onSuccess: () => {
      toast.success("工作流已删除");
      void utils.workflow.listEnriched.invalidate();
    },
    onError: () => toast.error("删除失败"),
  });

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState("");

  const filteredWorkflows = useMemo(() => {
    if (!workflows) return [];
    return workflows.filter((wf) => {
      if (statusFilter === "draft" && wf.publishedVersion > 0) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!wf.name.toLowerCase().includes(q) && !wf.flowId.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [workflows, search, statusFilter]);

  const parentRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const columnCount = containerWidth >= 1024 ? 3 : containerWidth >= 640 ? 2 : 1;

  const rows = useMemo(() => {
    const result: (typeof filteredWorkflows)[] = [];
    for (let i = 0; i < filteredWorkflows.length; i += columnCount) {
      result.push(filteredWorkflows.slice(i, i + columnCount));
    }
    return result;
  }, [filteredWorkflows, columnCount]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200,
    overscan: 2,
  });

  const handleCreate = () => {
    setNewWorkflowName("");
    setShowCreateDialog(true);
  };

  const handleConfirmCreate = () => {
    const name = newWorkflowName.trim();
    if (!name) return;
    setShowCreateDialog(false);
    createWorkflow.mutate({
      name,
      flowId: `new-flow-${Date.now()}`,
      namespaceId: currentNamespace!,
    });
  };

  const handleDelete = () => {
    if (deleteTarget) {
      deleteWorkflow.mutate({ id: deleteTarget });
      setDeleteTarget(null);
    }
  };

  return (
    <div ref={parentRef} className="flex-1 overflow-auto p-6">
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
            {(["all", "draft"] as StatusFilter[]).map((key) => (
              <Button
                key={key}
                variant={statusFilter === key ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setStatusFilter(key)}
                className="text-xs"
              >
                {key === "all" ? "全部" : "草稿"}
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

        {!isLoading && filteredWorkflows?.length === 0 && workflows?.length === 0 && (
          <Card className="mx-auto max-w-lg">
            <CardHeader>
              <CardTitle className="text-xl">🎉 欢迎！</CardTitle>
              <CardDescription>您的工作空间已准备就绪。选择一种方式开始：</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-1">
                <Button
                  variant="outline"
                  className="flex h-auto flex-col items-center gap-2 py-4"
                  onClick={handleCreate}
                  disabled={createWorkflow.isPending}
                >
                  <FilePlus className="h-6 w-6" />
                  <span className="font-medium">新建工作流</span>
                  <span className="text-xs text-muted-foreground">从零开始</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {!isLoading && filteredWorkflows?.length === 0 && workflows && workflows.length > 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Workflow className="mb-4 h-12 w-12" />
            <p className="text-lg">无匹配结果</p>
            <p className="text-sm">尝试调整搜索条件或筛选器</p>
          </div>
        )}

        {filteredWorkflows && filteredWorkflows.length > 0 && (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];
              if (!row) return null;
              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                >
                  {row.map((wf) => (
                    <WorkflowCard
                      key={wf.id}
                      workflow={wf}
                      onNavigate={navigate}
                      onDelete={setDeleteTarget}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create workflow dialog */}
      <Dialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          if (!open) setShowCreateDialog(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新建工作流</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="请输入工作流名称"
              value={newWorkflowName}
              onChange={(e) => setNewWorkflowName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConfirmCreate();
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              取消
            </Button>
            <Button
              onClick={handleConfirmCreate}
              disabled={!newWorkflowName.trim() || createWorkflow.isPending}
            >
              {createWorkflow.isPending ? "创建中..." : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
  );
}
