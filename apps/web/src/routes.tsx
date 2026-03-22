import { useEffect } from "react"
import {
  createRouter,
  createRootRoute,
  createRoute,
  redirect,
  Outlet,
  useRouter,
} from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/router-devtools"
import { ReactFlowProvider } from "@xyflow/react"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  SidebarProvider,
  SidebarInset,
} from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/AppSidebar"
import { trpc } from "@/lib/trpc"
import { useWorkflowStore } from "@/stores/workflow"
import WorkflowListPage from "@/pages/WorkflowListPage"
import WorkflowEditorPage from "@/pages/WorkflowEditorPage"
import SetupPage from "@/pages/SetupPage"

import { SettingsPage } from "@/pages/SettingsPage"
import { TemplatesPage } from "@/pages/TemplatesPage"
import { ExecutionPage } from "@/pages/ExecutionPage"
import { VersionsPage } from "@/pages/VersionsPage"
import { TriggersPage } from "@/pages/TriggersPage"

function SidebarLayout() {
  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <SidebarInset className="flex flex-1 flex-col overflow-hidden">
          <Outlet />
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}

/** 根路由守卫：检测 namespace 状态，引导用户到 /setup 或 /workflows */
function NamespaceGuard({ children }: { children: React.ReactNode }) {
  const { data: namespaces, isLoading } = trpc.namespace.list.useQuery()
  const setCurrentNamespace = useWorkflowStore((s) => s.setCurrentNamespace)
  const setHasNamespaces = useWorkflowStore((s) => s.setHasNamespaces)
  const router = useRouter()

  useEffect(() => {
    if (isLoading || !namespaces) return
    setHasNamespaces(namespaces.length > 0)
    if (namespaces.length > 0) {
      // 自动选择第一个 namespace
      const current = useWorkflowStore.getState().currentNamespace
      if (!current) {
        setCurrentNamespace(namespaces[0].id)
      }
    } else {
      // 没有 Namespace，跳转到引导页
      const currentPath = router.state.location.pathname
      if (currentPath !== "/setup") {
        router.navigate({ to: "/setup" })
      }
    }
  }, [namespaces, isLoading, setCurrentNamespace, setHasNamespaces, router])

  if (isLoading) return null

  return <>{children}</>
}

const rootRoute = createRootRoute({
  component: () => (
    <TooltipProvider>
      <NamespaceGuard>
        <Outlet />
      </NamespaceGuard>
      <TanStackRouterDevtools position="bottom-left" />
    </TooltipProvider>
  ),
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  loader: () => {
    throw redirect({ to: "/workflows" })
  },
})

// Setup page: no sidebar
const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/setup",
  component: () => <SetupPage />,
})

// Sidebar layout wraps routes that need navigation
const sidebarLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "sidebar-layout",
  component: SidebarLayout,
})

// Workflow list: inside sidebar layout
const workflowsRoute = createRoute({
  getParentRoute: () => sidebarLayoutRoute,
  path: "/workflows",
  component: () => (
    <div className="flex-1 overflow-auto">
      <WorkflowListPage />
    </div>
  ),
})

// Workflow editor: full-screen, no sidebar, uses path param
const workflowEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workflows/$workflowId/edit",
  component: () => (
    <div className="h-screen flex flex-col">
      <div className="flex-1 overflow-hidden">
        <ReactFlowProvider>
          <WorkflowEditorPage />
        </ReactFlowProvider>
      </div>
    </div>
  ),
})

const settingsRoute = createRoute({
  getParentRoute: () => sidebarLayoutRoute,
  path: "/settings",
  component: () => <SettingsPage />,
})

const templatesRoute = createRoute({
  getParentRoute: () => sidebarLayoutRoute,
  path: "/templates",
  component: () => <TemplatesPage />,
})

const workflowExecutionsRoute = createRoute({
  getParentRoute: () => sidebarLayoutRoute,
  path: "/workflows/$workflowId/executions",
  component: () => <ExecutionPage />,
})

const workflowVersionsRoute = createRoute({
  getParentRoute: () => sidebarLayoutRoute,
  path: "/workflows/$workflowId/versions",
  component: () => <VersionsPage />,
})

const workflowTriggersRoute = createRoute({
  getParentRoute: () => sidebarLayoutRoute,
  path: "/workflows/$workflowId/triggers",
  component: () => <TriggersPage />,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  setupRoute,
  workflowEditRoute,
  sidebarLayoutRoute.addChildren([
    workflowsRoute,
    settingsRoute,
    templatesRoute,
    workflowExecutionsRoute,
    workflowVersionsRoute,
    workflowTriggersRoute,
  ]),
])

export const router = createRouter({ routeTree })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
