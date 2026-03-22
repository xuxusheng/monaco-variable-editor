import { Link, useMatchRoute } from "@tanstack/react-router"
import {
  Workflow,
  Settings,
  BookTemplate,
  ChevronsLeft,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar"

const workflowItems = [
  { label: "工作流编辑器", to: "/workflows", icon: Workflow },
  { label: "模板库", to: "/templates", icon: BookTemplate },
] as const

const settingItems = [
  { label: "项目空间设置", to: "/settings", icon: Settings },
] as const

function NavItem({ label, to, icon: Icon }: { label: string; to: string; icon: React.ComponentType<{ className?: string }> }) {
  const matchRoute = useMatchRoute()
  const isActive = !!matchRoute({ to: to as any })

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
        tooltip={label}
        render={
          <Link to={to}>
            <Icon className="size-4" />
            <span>{label}</span>
          </Link>
        }
      />
    </SidebarMenuItem>
  )
}

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="h-12 border-b border-sidebar-border flex items-center px-3">
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:hidden">
          <Workflow className="size-5 text-sidebar-primary" />
          <span className="text-sm font-semibold text-sidebar-foreground">Weave</span>
        </div>
        <div className="hidden group-data-[collapsible=icon]:flex">
          <Workflow className="size-5 text-sidebar-primary" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>工作流</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {workflowItems.map((item) => (
                <NavItem key={item.to} {...item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>设置</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingItems.map((item) => (
                <NavItem key={item.to} {...item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2">
        <SidebarTrigger className="w-full justify-start gap-2 p-2 h-8 text-sm">
          <ChevronsLeft className="size-4" />
          <span>折叠</span>
        </SidebarTrigger>
      </SidebarFooter>
    </Sidebar>
  )
}
