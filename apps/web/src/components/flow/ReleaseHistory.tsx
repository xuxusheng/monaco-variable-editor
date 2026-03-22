/**
 * ReleaseHistory — 版本历史面板
 * 显示已发布版本，支持回滚 + YAML 查看 + 版本对比
 */

import { useCallback, useMemo, useState } from "react"
import { toast } from "sonner"
import Editor from "@monaco-editor/react"
import { Inbox, Copy, Package, GitCompare } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"
import { fromKestraYaml } from "@/lib/yamlConverter"
import { diffNodes } from "@/lib/diff"
import { DiffSummary } from "@/components/flow/DiffSummary"

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

type ViewMode = "list" | "yaml" | "compare"

export function ReleaseHistory({
  releases,
  onRollback,
  onClose,
}: ReleaseHistoryProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("list")
  const [viewYaml, setViewYaml] = useState<ReleaseEntry | null>(null)
  const [rollbackTarget, setRollbackTarget] = useState<ReleaseEntry | null>(null)

  // 对比模式状态
  const [compareBase, setCompareBase] = useState<ReleaseEntry | null>(null)
  const [compareTarget, setCompareTarget] = useState<ReleaseEntry | null>(null)

  const handleRollback = useCallback(
    (release: ReleaseEntry) => {
      setRollbackTarget(release)
    },
    [],
  )

  const confirmRollback = useCallback(() => {
    if (rollbackTarget) {
      onRollback(rollbackTarget.id)
      toast.success(`已恢复到 v${rollbackTarget.version}，请继续编辑`)
      setRollbackTarget(null)
    }
  }, [rollbackTarget, onRollback])

  const handleCopyYaml = useCallback((yaml: string) => {
    navigator.clipboard.writeText(yaml)
    toast.success("YAML 已复制")
  }, [])

  const startCompare = useCallback((release: ReleaseEntry) => {
    setCompareBase(release)
    setCompareTarget(null)
    setViewMode("compare")
  }, [])

  const exitView = useCallback(() => {
    setViewMode("list")
    setViewYaml(null)
    setCompareBase(null)
    setCompareTarget(null)
  }, [])

  // 计算 diff
  const compareDiff = useMemo(() => {
    if (!compareBase || !compareTarget) return null
    try {
      const baseNodes = fromKestraYaml(compareBase.yaml).nodes
      const targetNodes = fromKestraYaml(compareTarget.yaml).nodes
      // base = 旧版本, target = 新版本
      return diffNodes(baseNodes, targetNodes)
    } catch {
      return null
    }
  }, [compareBase, compareTarget])

  const dialogTitle = useMemo(() => {
    if (viewMode === "yaml" && viewYaml) return `v${viewYaml.version} YAML`
    if (viewMode === "compare") {
      if (compareTarget) {
        return `v${compareBase?.version} → v${compareTarget.version} 对比`
      }
      return "选择对比版本"
    }
    return "版本历史"
  }, [viewMode, viewYaml, compareBase, compareTarget])

  return (
    <>
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        showCloseButton={false}
        className="fixed top-0 right-0 left-auto translate-x-0 translate-y-0 h-screen w-full md:w-[560px] max-w-none rounded-none ring-0 p-0 flex flex-col gap-0 animate-in slide-in-from-right duration-200 zoom-in-100 zoom-out-100 fade-in-0 fade-out-0"
      >
        {/* Header */}
        <DialogHeader className="flex flex-row items-center justify-between px-5 py-4 border-b border-border gap-0">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4" />
            <DialogTitle>{dialogTitle}</DialogTitle>
          </div>
          <div className="flex items-center gap-2">
            {viewMode !== "list" && (
              <button
                onClick={exitView}
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
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {viewMode === "yaml" && viewYaml ? (
            /* YAML 查看 */
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
          ) : viewMode === "compare" ? (
            /* 版本对比 */
            <div className="h-full flex flex-col overflow-y-auto">
              {!compareTarget ? (
                /* 选择目标版本 */
                <div className="px-5 py-4">
                  <p className="text-sm text-muted-foreground mb-3">
                    选择要与 v{compareBase?.version} 对比的版本：
                  </p>
                  <div className="divide-y divide-border border border-border rounded-md">
                    {releases
                      .filter((r) => r.id !== compareBase?.id)
                      .map((release) => (
                        <button
                          key={release.id}
                          onClick={() => setCompareTarget(release)}
                          className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-indigo-600">
                              v{release.version}
                            </span>
                            <span className="text-sm truncate">{release.name}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatTime(release.publishedAt)}
                          </span>
                        </button>
                      ))}
                  </div>
                </div>
              ) : compareDiff ? (
                /* Diff 结果 */
                <div className="px-5 py-4 space-y-4">
                  <div className="flex items-center gap-2 text-sm">
                    <GitCompare className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">
                      v{compareBase?.version}「{compareBase?.name}」
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-medium">
                      v{compareTarget.version}「{compareTarget.name}」
                    </span>
                  </div>
                  <div className="rounded-md border border-border p-4 bg-muted/30">
                    <DiffSummary diff={compareDiff} />
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  YAML 解析失败，无法对比
                </div>
              )}
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
            /* 版本列表 */
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
                      onClick={() => { setViewYaml(release); setViewMode("yaml") }}
                      className="px-2.5 py-1 rounded text-xs font-medium bg-muted hover:bg-muted/80"
                    >
                      查看 YAML
                    </button>
                    {releases.length >= 2 && (
                      <button
                        onClick={() => startCompare(release)}
                        className="px-2.5 py-1 rounded text-xs font-medium bg-muted hover:bg-muted/80"
                      >
                        对比
                      </button>
                    )}
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
      </DialogContent>
    </Dialog>

    {/* 回滚确认 */}
    <AlertDialog open={!!rollbackTarget} onOpenChange={(open) => { if (!open) setRollbackTarget(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认回滚</AlertDialogTitle>
          <AlertDialogDescription>
            从版本 v{rollbackTarget?.version}「{rollbackTarget?.name}」创建新草稿？
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setRollbackTarget(null)}>取消</AlertDialogCancel>
          <AlertDialogAction onClick={confirmRollback}>回滚</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
