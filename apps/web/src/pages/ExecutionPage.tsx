/**
 * ExecutionPage — 执行历史独立页面
 * 合并草稿执行 + 版本执行，带 Sidebar 布局
 */

import { useState } from "react";
import { useParams, Link } from "@tanstack/react-router";
import { History, ChevronRight } from "lucide-react";
import { ExecutionHistory } from "@/components/flow/ExecutionHistory";
import { ProductionExecHistory } from "@/components/flow/ProductionExecHistory";
import { useWorkflowStore } from "@/stores/workflow";
import { ExecutionDrawer } from "@/components/flow/ExecutionDrawer";

type ExecTab = "draft" | "production";

export function ExecutionPage() {
  const { workflowId } = useParams({ from: "/sidebar-layout/workflows/$workflowId/executions" });
  const [activeTab, setActiveTab] = useState<ExecTab>("draft");
  const setCurrentExecution = useWorkflowStore((s) => s.setCurrentExecution);
  const currentExecution = useWorkflowStore((s) => s.currentExecution);

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
          <History className="w-4 h-4" /> 执行历史
        </span>
      </div>

      {/* Tab 切换 */}
      <div className="flex border-b border-border shrink-0">
        <button
          onClick={() => setActiveTab("draft")}
          className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === "draft"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          草稿执行
        </button>
        <button
          onClick={() => setActiveTab("production")}
          className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === "production"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          版本执行
        </button>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-hidden flex">
        {activeTab === "draft" ? (
          <ExecutionHistory
            workflowId={workflowId}
            onSelect={(exec) => setCurrentExecution(exec)}
            onClose={() => {}}
          />
        ) : (
          <ProductionExecHistory workflowId={workflowId} onClose={() => {}} />
        )}

        {/* 执行详情抽屉 */}
        {currentExecution && (
          <div className="flex-1 border-l border-border">
            <ExecutionDrawer onClose={() => setCurrentExecution(null)} />
          </div>
        )}
      </div>
    </div>
  );
}
