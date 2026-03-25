import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Layers, Trash2 } from "lucide-react";
import {
  BUILTIN_TEMPLATES,
  getUserTemplates,
  deleteUserTemplate,
  type WorkflowTemplate,
} from "@/lib/templates";

interface TemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (template: WorkflowTemplate) => void;
}

export function TemplateDialog({ open, onOpenChange, onSelect }: TemplateDialogProps) {
  const [userTemplates, setUserTemplates] = useState<WorkflowTemplate[]>(() => getUserTemplates());

  const handleDeleteUserTemplate = (id: string) => {
    deleteUserTemplate(id);
    setUserTemplates(getUserTemplates());
  };

  const handleSelect = (template: WorkflowTemplate) => {
    onSelect(template);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>从模板创建工作流</DialogTitle>
          <DialogDescription>
            选择一个模板快速开始，或使用「保存为模板」将当前工作流保存为模板。
          </DialogDescription>
        </DialogHeader>

        {/* 内置模板 */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">内置模板</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {BUILTIN_TEMPLATES.map((tpl) => (
              <Card
                key={tpl.id}
                className="cursor-pointer hover:ring-2 hover:ring-primary/50 transition-shadow"
                onClick={() => handleSelect(tpl)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{tpl.name}</CardTitle>
                    <Badge variant="secondary">{tpl.category}</Badge>
                  </div>
                  <CardDescription className="text-xs">{tpl.description}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Layers className="w-3 h-3" />
                    {tpl.nodes.length} 节点 · {tpl.edges.length} 连线 · {tpl.inputs.length} 输入
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* 我的模板 */}
        {userTemplates.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">我的模板</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {userTemplates.map((tpl) => (
                <Card
                  key={tpl.id}
                  className="cursor-pointer hover:ring-2 hover:ring-primary/50 transition-shadow"
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm" onClick={() => handleSelect(tpl)}>
                        {tpl.name}
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteUserTemplate(tpl.id);
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                    <CardDescription className="text-xs">{tpl.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0" onClick={() => handleSelect(tpl)}>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Layers className="w-3 h-3" />
                      {tpl.nodes.length} 节点 · {tpl.edges.length} 连线 · {tpl.inputs.length} 输入
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
