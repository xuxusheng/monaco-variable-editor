import { useState } from "react";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { Workflow, Settings, BookTemplate, ChevronsLeft, Plus } from "lucide-react";
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
} from "@/components/ui/sidebar";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useWorkflowStore } from "@/stores/workflow";
import { trpc } from "@/lib/trpc";
import { NamespaceCreateDialog } from "@/components/flow/NamespaceCreateDialog";

const workflowItems = [
  { label: "工作流编辑器", to: "/workflows", icon: Workflow },
  { label: "模板库", to: "/templates", icon: BookTemplate },
] as const;

const settingItems = [{ label: "项目空间设置", to: "/settings", icon: Settings }] as const;

function NavItem({
  label,
  to,
  icon: Icon,
}: {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const matchRoute = useMatchRoute();
  const isActive = !!matchRoute({ to: to as any });

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
  );
}

export function AppSidebar() {
  const currentNamespace = useWorkflowStore((s) => s.currentNamespace);
  const setCurrentNamespace = useWorkflowStore((s) => s.setCurrentNamespace);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const { data: namespaces } = trpc.namespace.list.useQuery();
  const utils = trpc.useUtils();

  const handleValueChange = (v: string | null) => {
    if (v === "__create__") {
      setCreateDialogOpen(true);
      return;
    }
    if (v) setCurrentNamespace(v);
  };

  const handleCreated = (id: string) => {
    setCurrentNamespace(id);
    void utils.namespace.list.invalidate();
  };

  return (
    <>
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
          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel>项目空间</SidebarGroupLabel>
            <SidebarGroupContent>
              <Select value={currentNamespace ?? ""} onValueChange={handleValueChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择项目空间" />
                </SelectTrigger>
                <SelectContent className="w-[--radix-select-trigger-width]">
                  {namespaces?.map((ns) => (
                    <SelectItem key={ns.id} value={ns.id}>
                      {ns.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="__create__">
                    <span className="flex items-center gap-1">
                      <Plus className="size-3.5" />
                      新建项目空间
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </SidebarGroupContent>
          </SidebarGroup>
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

      <NamespaceCreateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={handleCreated}
      />
    </>
  );
}
