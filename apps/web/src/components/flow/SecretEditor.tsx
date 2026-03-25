import { useState } from "react";
import { Save, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface SecretEditorProps {
  namespaceId: string;
  editing?: { id: string; key: string; description?: string } | null;
  onClose: () => void;
  onSaved: () => void;
}

const KEY_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

export function SecretEditor({ namespaceId, editing, onClose, onSaved }: SecretEditorProps) {
  const [key, setKey] = useState(editing?.key ?? "");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [showValue, setShowValue] = useState(false);
  const [keyError, setKeyError] = useState("");

  const createMutation = trpc.workflow.secretCreate.useMutation({
    onSuccess: () => {
      toast.success("密钥已创建");
      onSaved();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.workflow.secretUpdate.useMutation({
    onSuccess: () => {
      toast.success("密钥已更新");
      onSaved();
    },
    onError: (err) => toast.error(err.message),
  });

  const isEdit = !!editing;

  function validateKey(v: string) {
    if (!v) {
      setKeyError("密钥名称不能为空");
      return false;
    }
    if (!KEY_PATTERN.test(v)) {
      setKeyError("只能使用大写字母、数字和下划线，且以字母或下划线开头");
      return false;
    }
    setKeyError("");
    return true;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!validateKey(key)) return;
    if (!value) {
      toast.error("密钥值不能为空");
      return;
    }

    const payload = { namespaceId, key, value, description: description || undefined };

    if (isEdit) {
      updateMutation.mutate({ id: editing.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const pending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑密钥" : "添加密钥"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            {/* Key */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Key</Label>
              <Input
                value={key}
                onChange={(e) => {
                  setKey(e.target.value.toUpperCase());
                  if (keyError) validateKey(e.target.value.toUpperCase());
                }}
                onBlur={() => key && validateKey(key)}
                disabled={isEdit}
                placeholder="DATABASE_URL"
                className={keyError ? "border-destructive" : ""}
              />
              {keyError && <p className="text-xs text-destructive">{keyError}</p>}
            </div>

            {/* Value */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Value</Label>
              <div className="relative">
                <Input
                  type={showValue ? "text" : "password"}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={isEdit ? "输入新值以替换" : "输入密钥值"}
                  className="pr-8"
                />
                <button
                  type="button"
                  onClick={() => setShowValue(!showValue)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showValue ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="可选描述"
              />
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              <Save className="w-3.5 h-3.5" />
              {pending ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
