import { useEffect, useRef } from "react"
import { Copy, FolderOpen, AlertTriangle, Trash2, Flag } from "lucide-react"

interface ContextMenuProps {
  position: { x: number; y: number }
  onClose: () => void
  onDelete: () => void
  onDuplicate: () => void
  onAddErrors?: () => void
  onAddFinally?: () => void
  isContainer?: boolean
  onToggleCollapse?: () => void
}

export function ContextMenu({
  position,
  onClose,
  onDelete,
  onDuplicate,
  onAddErrors,
  onAddFinally,
  isContainer,
  onToggleCollapse,
}: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  // 外部点击关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [onClose])

  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 rounded-lg py-1 min-w-[160px]"
      style={{ left: position.x, top: position.y }}
    >
      <button
        role="menuitem"
        className="w-full px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-default flex items-center gap-2 rounded-sm"
        onClick={onDuplicate}
      >
        <Copy className="w-3.5 h-3.5" /> 复制节点
      </button>

      {isContainer && onToggleCollapse && (
        <button
          role="menuitem"
          className="w-full px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-default flex items-center gap-2 rounded-sm"
          onClick={onToggleCollapse}
        >
          <FolderOpen className="w-3.5 h-3.5" /> 折叠/展开
        </button>
      )}

      <div className="h-px bg-border my-1" />

      {onAddErrors && (
        <button
          role="menuitem"
          className="w-full px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-default flex items-center gap-2 rounded-sm"
          onClick={onAddErrors}
        >
          <AlertTriangle className="w-3.5 h-3.5" /> 添加错误处理
        </button>
      )}

      {onAddFinally && (
        <button
          role="menuitem"
          className="w-full px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-default flex items-center gap-2 rounded-sm"
          onClick={onAddFinally}
        >
          <Flag className="w-3.5 h-3.5" /> 添加 finally
        </button>
      )}

      <div className="h-px bg-border my-1" />

      <button
        role="menuitem"
        className="w-full px-3 py-1.5 text-sm hover:bg-destructive/10 text-destructive cursor-default flex items-center gap-2 rounded-sm"
        onClick={onDelete}
      >
        <Trash2 className="w-3.5 h-3.5" /> 删除
      </button>
    </div>
  )
}
