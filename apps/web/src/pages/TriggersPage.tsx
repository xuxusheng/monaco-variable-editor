/**
 * TriggersPage — 触发器管理独立页面
 * 直接使用 TriggerPanel 组件，带 Sidebar 布局
 */

import { useState } from "react";
import { useParams, Link } from "@tanstack/react-router";
import { Zap, ChevronRight } from "lucide-react";
import { TriggerPanel } from "@/components/flow/TriggerPanel";
import { TriggerCreateForm } from "@/components/flow/TriggerCreateForm";
import { trpc } from "@/lib/trpc";

export function TriggersPage() {
  const { workflowId } = useParams({ from: "/sidebar-layout/workflows/$workflowId/triggers" });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const utils = trpc.useUtils();

  const { data: releasesData } = trpc.workflowRelease.list.useQuery(
    { workflowId },
    { enabled: !!workflowId },
  );

  const releases = (releasesData?.items ?? []).map((r) => ({
    id: r.id,
    version: r.version,
    name: r.name,
  }));

  return (
    <div className="flex flex-col h-full">
      {/* 面包屑 */}
      <div className="flex items-center gap-1.5 px-5 py-3 border-b border-border text-sm text-muted-foreground shrink-0">
        <Link to="/workflows" className="hover:text-foreground transition-colors">
          工作流
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <Link
          to="/workflows/$workflowId/edit"
          params={{ workflowId }}
          className="hover:text-foreground transition-colors"
        >
          {workflowId}
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-foreground font-medium flex items-center gap-1.5">
          <Zap className="w-4 h-4" /> 触发器
        </span>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-hidden">
        <TriggerPanel workflowId={workflowId} onCreate={() => setShowCreateForm(true)} />
      </div>

      {showCreateForm && (
        <TriggerCreateForm
          workflowId={workflowId}
          releases={releases}
          onClose={() => setShowCreateForm(false)}
          onCreated={() => {
            setShowCreateForm(false);
            void utils.workflowTrigger.list.invalidate({ workflowId });
          }}
        />
      )}
    </div>
  );
}
