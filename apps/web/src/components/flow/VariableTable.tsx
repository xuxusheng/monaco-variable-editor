/**
 * VariableTable — 变量列表表格
 * 支持查看 / 创建 / 编辑 / 删除
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, Inbox } from "lucide-react";
import { VariableEditor } from "./VariableEditor";
import type { ApiWorkflowVariable } from "@/types/api";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

interface VariableTableProps {
  namespaceId: string;
}

type VariableItem = ApiWorkflowVariable & { id: string };

export function VariableTable({ namespaceId }: VariableTableProps) {
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<{
    id: string;
    key: string;
    value: string;
    description?: string;
  } | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: variables, refetch } = trpc.workflow.variableList.useQuery(
    { namespaceId },
    { enabled: !!namespaceId },
  );

  const deleteVar = trpc.workflow.variableDelete.useMutation({
    onSuccess: () => {
      toast.success("变量已删除");
      void refetch();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleEdit = (v: VariableItem) => {
    setEditing(v);
    setShowEditor(true);
  };

  const handleDelete = (id: string) => {
    deleteVar.mutate({ id });
    setDeletingId(null);
  };

  const items: VariableItem[] = (variables as VariableItem[] | undefined) ?? [];

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">变量 ({items.length})</h3>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setShowEditor(true);
          }}
        >
          <Plus className="w-3.5 h-3.5" />
          添加
        </Button>
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
          <Inbox className="w-8 h-8 mb-2" />
          <p className="text-sm">暂无变量</p>
        </div>
      )}

      {/* Table */}
      {items.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead>Key</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-24 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((v) => {
                const isExpanded = expandedKey === v.id;
                const truncated = v.value.length > 40 ? v.value.slice(0, 40) + "..." : v.value;

                return (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono text-xs">{v.key}</TableCell>
                    <TableCell>
                      <button
                        onClick={() => setExpandedKey(isExpanded ? null : v.id)}
                        className="flex items-center gap-1 text-left text-xs hover:text-foreground transition-colors"
                      >
                        <span className="font-mono whitespace-pre-wrap break-all">
                          {isExpanded ? v.value : truncated}
                        </span>
                        {v.value.length > 40 &&
                          (isExpanded ? (
                            <ChevronUp className="w-3 h-3 shrink-0" />
                          ) : (
                            <ChevronDown className="w-3 h-3 shrink-0" />
                          ))}
                      </button>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {v.description || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleEdit(v)}
                          title="编辑"
                        >
                          <Pencil />
                        </Button>
                        {deletingId === v.id ? (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="destructive"
                              size="xs"
                              onClick={() => handleDelete(v.id)}
                            >
                              确认
                            </Button>
                            <Button variant="ghost" size="xs" onClick={() => setDeletingId(null)}>
                              取消
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => setDeletingId(v.id)}
                            title="删除"
                          >
                            <Trash2 className="text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Editor dialog */}
      {showEditor && (
        <VariableEditor
          namespaceId={namespaceId}
          editing={editing}
          onClose={() => {
            setShowEditor(false);
            setEditing(null);
          }}
          onSaved={() => refetch()}
        />
      )}
    </div>
  );
}
