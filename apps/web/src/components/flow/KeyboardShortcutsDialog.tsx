import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Shortcut {
  keys: string;
  description: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: "Ctrl/⌘ + S", description: "保存草稿" },
  { keys: "Ctrl/⌘ + Z", description: "撤销" },
  { keys: "Ctrl/⌘ + Shift + Z", description: "重做" },
  { keys: "Ctrl/⌘ + A", description: "全选节点" },
  { keys: "Ctrl/⌘ + D", description: "复制选中节点" },
  { keys: "Ctrl/⌘ + F", description: "搜索节点" },
  { keys: "Delete / Backspace", description: "删除选中节点" },
  { keys: "Escape", description: "取消选择 / 关闭面板" },
  { keys: "Shift + A", description: "自动布局" },
  { keys: "Shift + F", description: "适应画布" },
  { keys: "?", description: "快捷键速查表" },
];

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>键盘快捷键</DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          {SHORTCUTS.map((s) => (
            <div
              key={s.keys}
              className="flex items-center justify-between py-1.5 px-1 rounded hover:bg-muted/50"
            >
              <span className="text-sm text-muted-foreground">{s.description}</span>
              <kbd className="px-2 py-0.5 rounded bg-muted border border-border text-xs font-mono text-foreground">
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
