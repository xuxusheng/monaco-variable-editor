import {
  createRouter,
  createRootRoute,
  createRoute,
  redirect,
  Outlet,
} from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/router-devtools"
import { ReactFlowProvider } from "@xyflow/react"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  SidebarProvider,
  SidebarInset,
} from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/AppSidebar"
import WorkflowListPage from "@/pages/WorkflowListPage"
import WorkflowEditorPage from "@/pages/WorkflowEditorPage"

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

const rootRoute = createRootRoute({
  component: () => (
    <TooltipProvider>
      <Outlet />
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
