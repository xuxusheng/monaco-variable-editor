import { useState } from "react";
import { Plus, Pencil, Trash2, Eye, EyeOff, Key, Inbox } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SecretEditor } from "./SecretEditor";

interface SecretTableProps {
  namespaceId: string;
}

function RevealCell({ id }: { id: string }) {
  const [revealed, setRevealed] = useState(false);
  const { data } = trpc.workflow.secretReveal.useQuery({ id }, { enabled: revealed });

  return (
    <button
      onClick={() => setRevealed(!revealed)}
      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      {revealed ? (
        <>
          <span className="font-mono">{data?.value ?? "..."}</span>
          <EyeOff className="w-3.5 h-3.5" />
        </>
      ) : (
        <>
          <span>点击显示</span>
          <Eye className="w-3.5 h-3.5" />
        </>
      )}
    </button>
  );
}

export function SecretTable({ namespaceId }: SecretTableProps) {
  const [editorState, setEditorState] = useState<{
    open: boolean;
    editing?: { id: string; key: string; description?: string };
  }>({ open: false });

  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    key: string;
  } | null>(null);

  const { data, refetch } = trpc.workflow.secretList.useQuery(
    { namespaceId },
    { enabled: !!namespaceId },
  );

  const deleteMutation = trpc.workflow.secretDelete.useMutation({
    onSuccess: () => {
      toast.success("密钥已删除");
      void refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  function handleConfirmDelete() {
    if (deleteTarget) {
      deleteMutation.mutate({ id: deleteTarget.id });
      setDeleteTarget(null);
    }
  }

  const items = data ?? [];

  return (
    <div data-slot="secret-table">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Key className="w-4 h-4 text-muted-foreground" />
          <span>密钥 ({items.length})</span>
        </div>
        <Button size="sm" onClick={() => setEditorState({ open: true })}>
          <Plus className="w-3.5 h-3.5" />
          添加
        </Button>
      </div>

      {/* List */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground px-6 text-center">
          <Inbox className="w-10 h-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium mb-1">暂无密钥</p>
          <p className="text-xs text-muted-foreground/70">点击上方"添加"按钮创建第一个密钥</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Key</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-[72px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} className="group">
                <TableCell className="font-mono text-sm font-medium">{item.key}</TableCell>
                <TableCell>
                  <RevealCell id={item.id} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {item.description || <span className="text-muted-foreground/50">—</span>}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() =>
                        setEditorState({
                          open: true,
                          editing: {
                            id: item.id,
                            key: item.key,
                            description: item.description ?? undefined,
                          },
                        })
                      }
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => setDeleteTarget({ id: item.id, key: item.key })}
                    >
                      <Trash2 className="text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除密钥</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除密钥 &quot;{deleteTarget?.key}&quot; 吗？密钥删除后不可恢复！
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmDelete}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Editor dialog */}
      {editorState.open && (
        <SecretEditor
          namespaceId={namespaceId}
          editing={editorState.editing}
          onClose={() => setEditorState({ open: false })}
          onSaved={() => {
            setEditorState({ open: false });
            void refetch();
          }}
        />
      )}
    </div>
  );
}
