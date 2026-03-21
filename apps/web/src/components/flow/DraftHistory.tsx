/**
 * DraftHistory — 草稿历史面板
 * 显示最近 20 条草稿，支持回滚
 */

import { useCallback } from "react"
import { toast } from "sonner"

interface DraftEntry {
  id: string
  message: string | null
  createdAt: string
}

interface DraftHistoryProps {
  drafts: DraftEntry[]
  onRollback: (draftId: string) => void
  onClose: () => void
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, "0")
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function DraftHistory({ drafts, onRollback, onClose }: DraftHistoryProps) {
  const handleRollback = useCallback(
    (draft: DraftEntry) => {
      const label = draft.message || formatTime(draft.createdAt)
      if (window.confirm(`回滚到「${label}」？当前未保存的修改将丢失。`)) {
        onRollback(draft.id)
        toast.success(`已恢复到「${label}」`)
      }
    },
    [onRollback],
  )

  return (
    <div className="fixed top-0 right-0 h-screen w-full md:w-[400px] bg-card border-l border-border shadow-xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-lg">📜</span>
          <h2 className="text-base font-semibold">草稿历史</h2>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          ✕
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {drafts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground px-6 text-center">
            <span className="text-3xl mb-3">📭</span>
            <p className="text-sm font-medium mb-1">暂无草稿记录</p>
            <p className="text-xs text-muted-foreground/70">
              点击工具栏「📜 存草稿」保存当前编辑状态
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {drafts.map((draft, i) => (
              <div
                key={draft.id}
                className="flex items-center justify-between px-5 py-3 hover:bg-muted/50 transition-colors group"
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-sm font-medium truncate">
                    {draft.message || "手动保存"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatTime(draft.createdAt)}
                    {i === 0 && (
                      <span className="ml-2 text-indigo-500 font-medium">
                        最新
                      </span>
                    )}
                  </span>
                </div>
                <button
                  onClick={() => handleRollback(draft)}
                  className="opacity-0 group-hover:opacity-100 px-2.5 py-1 rounded text-xs font-medium bg-muted hover:bg-muted/80 transition-all"
                >
                  回滚到此
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
