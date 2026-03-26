import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Settings, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useWorkflowStore } from "@/stores/workflow";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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
import { SecretTable } from "@/components/flow/SecretTable";
import { VariableTable } from "@/components/flow/VariableTable";

export function SettingsPage() {
  const currentNamespace = useWorkflowStore((s) => s.currentNamespace);
  const NAMESPACE_ID = currentNamespace ?? "";

  if (!NAMESPACE_ID) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        请先选择一个项目空间
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-4xl p-6 space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Settings className="size-4" />
          <span className="font-medium text-foreground">项目空间设置</span>
        </div>

        <Tabs defaultValue="general">
          <TabsList variant="line">
            <TabsTrigger value="general">基本信息</TabsTrigger>
            <TabsTrigger value="secrets">Secrets</TabsTrigger>
            <TabsTrigger value="variables">Variables</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-6">
            <GeneralTab namespaceId={NAMESPACE_ID} />
          </TabsContent>

          <TabsContent value="secrets" className="mt-6">
            <SecretTable namespaceId={NAMESPACE_ID} />
          </TabsContent>

          <TabsContent value="variables" className="mt-6">
            <VariableTable namespaceId={NAMESPACE_ID} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ---- General Tab ----

function GeneralTab({ namespaceId }: { namespaceId: string }) {
  const navigate = useNavigate();
  const { data: namespace, isLoading } = trpc.namespace.get.useQuery({ id: namespaceId });

  const [name, setName] = useState("");
  const [kestraNamespace, setKestraNamespace] = useState("");
  const [description, setDescription] = useState("");
  const [dirty, setDirty] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Sync form state from server data
  useEffect(() => {
    if (namespace) {
      setName(namespace.name);
      setKestraNamespace(namespace.kestraNamespace);
      setDescription(namespace.description ?? "");
      setDirty(false);
    }
  }, [namespace]);

  const utils = trpc.useUtils();
  const updateMutation = trpc.namespace.update.useMutation({
    onSuccess: () => {
      toast.success("设置已保存");
      setDirty(false);
      void utils.namespace.get.invalidate({ id: namespaceId });
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.namespace.delete.useMutation({
    onSuccess: () => {
      toast.success("项目空间已删除");
      void utils.namespace.list.invalidate();
      void navigate({ to: "/workflows" });
    },
    onError: (err) => toast.error(err.message),
  });

  function handleSave() {
    updateMutation.mutate({
      id: namespaceId,
      name,
      kestraNamespace,
      description: description || undefined,
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-lg">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-lg">
      {/* Name */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">显示名称</Label>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
          placeholder="项目空间名称"
        />
      </div>

      {/* Kestra Namespace */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Kestra Namespace 映射</Label>
        <Input
          value={kestraNamespace}
          onChange={(e) => {
            setKestraNamespace(e.target.value);
            setDirty(true);
          }}
          placeholder="io.kestra.myproject"
        />
        <p className="text-xs text-muted-foreground">
          对应 Kestra 中的 namespace，用于同步变量和部署 flow
        </p>
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">描述</Label>
        <Textarea
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            setDirty(true);
          }}
          placeholder="可选描述"
          rows={3}
        />
      </div>

      {/* Save */}
      <Button onClick={handleSave} disabled={!dirty || updateMutation.isPending}>
        <Save className="w-3.5 h-3.5" />
        {updateMutation.isPending ? "保存中..." : "保存"}
      </Button>

      <Separator />

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-medium text-destructive">危险操作</h3>
          <p className="text-xs text-muted-foreground mt-1">
            删除项目空间将同时删除其下的所有工作流、草稿、版本和触发器。此操作不可撤销。
          </p>
        </div>
        <Button variant="destructive" size="sm" onClick={() => setShowDeleteDialog(true)}>
          <Trash2 className="w-3.5 h-3.5 mr-1" />
          删除项目空间
        </Button>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除项目空间</AlertDialogTitle>
            <AlertDialogDescription>
              此操作不可撤销。项目空间及其下的所有工作流、草稿、版本和触发器将被永久删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate({ id: namespaceId })}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
