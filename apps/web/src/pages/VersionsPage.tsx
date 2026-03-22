/**
 * VersionsPage — 版本管理独立页面
 * 合并草稿历史 + 发布版本历史，带 Sidebar 布局
 */

import { useState, useCallback, useMemo } from "react"
import { useParams, Link } from "@tanstack/react-router"
import { ScrollText, ChevronRight, Inbox, Copy, GitCompare } from "lucide-react"
import { toast } from "sonner"
import Editor from "@monaco-editor/react"
import { trpc } from "@/lib/trpc"
import { fromKestraYaml } from "@/lib/yamlConverter"
import { diffNodes } from "@/lib/diff"
import { DiffSummary } from "@/components/flow/DiffSummary"
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

type VersionTab = "drafts" | "releases"

interface ReleaseEntry {
  id: string
  version: number
  name: string
  yaml: string
  publishedAt: string
}

function formatDraftTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, "0")
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatReleaseTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

type ViewMode = "list" | "yaml" | "compare"

export function VersionsPage() {
  const { workflowId } = useParams({ from: "/sidebar-layout/workflows/$workflowId/versions" })
  const [activeTab, setActiveTab] = useState<VersionTab>("drafts")

  const draftsQuery = trpc.workflow.draftList.useQuery(
    { workflowId },
    { enabled: !!workflowId },
  )
  const releasesQuery = trpc.workflow.releaseList.useQuery(
    { workflowId },
    { enabled: !!workflowId },
  )

  const draftRollback = trpc.workflow.draftRollback.useMutation({
    onSuccess: () => toast.success("已恢复到所选草稿"),
    onError: () => toast.error("回滚失败"),
  })
  const releaseRollback = trpc.workflow.releaseRollback.useMutation({
    onSuccess: () => toast.success("已恢复到所选版本"),
    onError: () => toast.error("回滚失败"),
  })

  const handleDraftRollback = useCallback(
    async (draftId: string) => {
      await draftRollback.mutateAsync({ draftId })
      draftsQuery.refetch()
    },
    [draftRollback, draftsQuery],
  )

  const handleReleaseRollback = useCallback(
    async (releaseId: string) => {
      await releaseRollback.mutateAsync({ releaseId })
      releasesQuery.refetch()
    },
    [releaseRollback, releasesQuery],
  )

  const drafts = (draftsQuery.data ?? []).map((d) => ({
    id: d.id,
    message: d.message,
    createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt),
  }))

  const releases: ReleaseEntry[] = (releasesQuery.data ?? []).map((r) => ({
    id: r.id,
    version: r.version,
    name: r.name,
    yaml: r.yaml,
    publishedAt: r.publishedAt instanceof Date ? r.publishedAt.toISOString() : String(r.publishedAt),
  }))

  // Release view state
  const [viewMode, setViewMode] = useState<ViewMode>("list")
  const [viewYaml, setViewYaml] = useState<ReleaseEntry | null>(null)
  const [rollbackTarget, setRollbackTarget] = useState<ReleaseEntry | null>(null)
  const [compareBase, setCompareBase] = useState<ReleaseEntry | null>(null)
  const [compareTarget, setCompareTarget] = useState<ReleaseEntry | null>(null)

  const compareDiff = useMemo(() => {
    if (!compareBase || !compareTarget) return null
    try {
      const baseNodes = fromKestraYaml(compareBase.yaml).nodes
      const targetNodes = fromKestraYaml(compareTarget.yaml).nodes
      return diffNodes(baseNodes, targetNodes)
    } catch {
      return null
    }
  }, [compareBase, compareTarget])

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

  const confirmRollback = useCallback(() => {
    if (rollbackTarget) {
      handleReleaseRollback(rollbackTarget.id)
      toast.success(`已恢复到 v${rollbackTarget.version}，请继续编辑`)
      setRollbackTarget(null)
    }
  }, [rollbackTarget, handleReleaseRollback])

  // Draft rollback
  const handleDraftRollbackClick = useCallback(
    (draft: { id: string; message: string | null; createdAt: string }) => {
      const label = draft.message || formatDraftTime(draft.createdAt)
      if (window.confirm(`回滚到「${label}」？当前未保存的修改将丢失。`)) {
        handleDraftRollback(draft.id)
      }
    },
    [handleDraftRollback],
  )

  return (
    <div className="flex flex-col h-full">
      {/* 面包屑 */}
      <div className="flex items-center gap-1.5 px-5 py-3 border-b border-border text-sm text-muted-foreground shrink-0">
        <Link to="/workflows" className="hover:text-foreground transition-colors">工作流</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <Link to="/workflows/$workflowId/edit" params={{ workflowId }} className="hover:text-foreground transition-colors">
          {workflowId}
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-foreground font-medium flex items-center gap-1.5">
          <ScrollText className="w-4 h-4" /> 版本
        </span>
      </div>

      {/* Tab 切换 */}
      <div className="flex border-b border-border shrink-0">
        <button
          onClick={() => setActiveTab("drafts")}
          className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === "drafts"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          草稿历史
        </button>
        <button
          onClick={() => setActiveTab("releases")}
          className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === "releases"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          发布版本
        </button>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "drafts" ? (
          /* 草稿列表 */
          drafts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground px-6 text-center">
              <Inbox className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-sm font-medium mb-1">暂无草稿记录</p>
              <p className="text-xs text-muted-foreground/70">
                点击工具栏「存草稿」保存当前编辑状态
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
                      {formatDraftTime(draft.createdAt)}
                      {i === 0 && (
                        <span className="ml-2 text-indigo-500 font-medium">最新</span>
                      )}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDraftRollbackClick(draft)}
                    className="opacity-0 group-hover:opacity-100 px-2.5 py-1 rounded text-xs font-medium bg-muted hover:bg-muted/80 transition-all"
                  >
                    回滚到此
                  </button>
                </div>
              ))}
            </div>
          )
        ) : (
          /* 发布版本列表 */
          viewMode === "yaml" && viewYaml ? (
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between px-5 py-2 border-b border-border">
                <button
                  onClick={exitView}
                  className="px-3 py-1.5 rounded-md bg-muted hover:bg-muted/80 text-xs transition-colors"
                >
                  ← 返回列表
                </button>
                <button
                  onClick={() => handleCopyYaml(viewYaml.yaml)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-indigo-500 text-white text-xs font-medium hover:bg-indigo-600 transition-colors"
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
            <div className="h-full flex flex-col overflow-y-auto">
              {!compareTarget ? (
                <div className="px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-muted-foreground">
                      选择要与 v{compareBase?.version} 对比的版本：
                    </p>
                    <button
                      onClick={exitView}
                      className="px-3 py-1.5 rounded-md bg-muted hover:bg-muted/80 text-xs transition-colors"
                    >
                      ← 返回列表
                    </button>
                  </div>
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
                            {formatReleaseTime(release.publishedAt)}
                          </span>
                        </button>
                      ))}
                  </div>
                </div>
              ) : compareDiff ? (
                <div className="px-5 py-4 space-y-4">
                  <div className="flex items-center justify-between">
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
                    <button
                      onClick={exitView}
                      className="px-3 py-1.5 rounded-md bg-muted hover:bg-muted/80 text-xs transition-colors"
                    >
                      ← 返回列表
                    </button>
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
                      {formatReleaseTime(release.publishedAt)}
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
                      onClick={() => setRollbackTarget(release)}
                      className="px-2.5 py-1 rounded text-xs font-medium bg-muted hover:bg-muted/80"
                    >
                      回滚
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

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
    </div>
  )
}
