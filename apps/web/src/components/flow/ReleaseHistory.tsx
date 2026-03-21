/**
 * ReleaseHistory — 版本历史面板
 * 显示已发布版本，支持回滚 + YAML 查看
 */

import { useCallback, useState } from "react"
import { toast } from "sonner"
import Editor from "@monaco-editor/react"
import { Inbox, Copy, Package } from "lucide-react"

interface ReleaseEntry {
  id: string
  version: number
  name: string
  yaml: string
  publishedAt: string
}

interface ReleaseHistoryProps {
  releases: ReleaseEntry[]
  onRollback: (releaseId: string) => void
  onClose: () => void
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function ReleaseHistory({
  releases,
  onRollback,
  onClose,
}: ReleaseHistoryProps) {
  const [viewYaml, setViewYaml] = useState<ReleaseEntry | null>(null)

  const handleRollback = useCallback(
    (release: ReleaseEntry) => {
      if (
        window.confirm(
          `从版本 v${release.version}「${release.name}」创建新草稿？`,
        )
      ) {
        onRollback(release.id)
        toast.success(`已恢复到 v${release.version}，请继续编辑`)
      }
    },
    [onRollback],
  )

  const handleCopyYaml = useCallback((yaml: string) => {
    navigator.clipboard.writeText(yaml)
    toast.success("YAML 已复制")
  }, [])

  return (
    <div className="fixed top-0 right-0 h-screen w-full md:w-[560px] bg-card border-l border-border shadow-xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-lg"><Package className="w-4 h-4" /></span>
          <h2 className="text-base font-semibold">
            {viewYaml ? `v${viewYaml.version} YAML` : "版本历史"}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {viewYaml && (
            <button
              onClick={() => setViewYaml(null)}
              className="px-3 py-1.5 rounded-md bg-muted hover:bg-muted/80 text-xs transition-colors"
            >
              ← 返回列表
            </button>
          )}
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {viewYaml ? (
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-end gap-2 px-5 py-2 border-b border-border">
              <button
                onClick={() => handleCopyYaml(viewYaml.yaml)}
                className="px-3 py-1.5 rounded-md bg-indigo-500 text-white text-xs font-medium hover:bg-indigo-600 transition-colors"
              >
                <Copy className="w-3.5 h-3.5" /> 复制
              </button>
            </div>
            <div className="flex-1">
              <Editor
                height="100%"
                language="yaml"
                theme="vs"
                value={viewYaml.yaml}
                options={{
                  readOnly: true,
                  fontSize: 13,
                  lineHeight: 22,
                  minimap: { enabled: false },
                  padding: { top: 12 },
                  scrollBeyondLastLine: false,
                  wordWrap: "on",
                  automaticLayout: true,
                }}
              />
            </div>
          </div>
        ) : releases.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground px-6 text-center">
            <Inbox className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-sm font-medium mb-1">暂无发布版本</p>
            <p className="text-xs text-muted-foreground/70">
              点击工具栏「发布」创建第一个版本
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {releases.map((release, i) => (
              <div
                key={release.id}
                className="flex items-center justify-between px-5 py-3 hover:bg-muted/50 transition-colors group"
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-indigo-600">
                      v{release.version}
                    </span>
                    <span className="text-sm font-medium truncate">
                      {release.name}
                    </span>
                    {i === 0 && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-600 font-medium">
                        当前
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatTime(release.publishedAt)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                  <button
                    onClick={() => setViewYaml(release)}
                    className="px-2.5 py-1 rounded text-xs font-medium bg-muted hover:bg-muted/80"
                  >
                    查看 YAML
                  </button>
                  <button
                    onClick={() => handleRollback(release)}
                    className="px-2.5 py-1 rounded text-xs font-medium bg-muted hover:bg-muted/80"
                  >
                    回滚
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
