import { useEffect, useRef } from "react"
import { Copy, FolderOpen, AlertTriangle, Trash2, Flag } from "lucide-react"

interface ContextMenuProps {
  /** 菜单位置 */
  position: { x: number; y: number }
  /** 关闭回调 */
  onClose: () => void
  /** 删除回调 */
  onDelete: () => void
  /** 复制回调 */
  onDuplicate: () => void
  /** 添加错误处理回调 */
  onAddErrors?: () => void
  /** 添加 finally 回调 */
  onAddFinally?: () => void
  /** 是否为容器节点 */
  isContainer?: boolean
  /** 折叠/展开回调 */
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
  const menuRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [onClose])

  // ESC 关闭
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [onClose])

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[160px]"
      style={{ left: position.x, top: position.y }}
    >
      <MenuItem onClick={onDuplicate}>
        <Copy className="w-3.5 h-3.5" /> 复制节点
      </MenuItem>

      {isContainer && onToggleCollapse && (
        <MenuItem onClick={onToggleCollapse}>
          <FolderOpen className="w-3.5 h-3.5" /> 折叠/展开
        </MenuItem>
      )}

      <div className="my-1 border-t border-border" />

      {onAddErrors && (
        <MenuItem onClick={onAddErrors}>
          <AlertTriangle className="w-3.5 h-3.5" /> 添加错误处理
        </MenuItem>
      )}

      {onAddFinally && (
        <MenuItem onClick={onAddFinally}>
          <Flag className="w-3.5 h-3.5" /> 添加 finally
        </MenuItem>
      )}

      <div className="my-1 border-t border-border" />

      <MenuItem onClick={onDelete} className="text-red-600 hover:bg-red-50">
        <Trash2 className="w-3.5 h-3.5" /> 删除
      </MenuItem>
    </div>
  )
}

function MenuItem({
  children,
  onClick,
  className = "",
}: {
  children: React.ReactNode
  onClick: () => void
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2 transition-colors ${className}`}
    >
      {children}
    </button>
  )
}
