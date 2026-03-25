import { memo } from "react";
import { LayoutDashboard, Maximize2, BookTemplate, BookmarkPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CanvasToolbarProps {
  onAutoLayout: () => void;
  onFitView: () => void;
  onFromTemplate: () => void;
  onSaveAsTemplate: () => void;
}

export const CanvasToolbar = memo(function CanvasToolbar({
  onAutoLayout,
  onFitView,
  onFromTemplate,
  onSaveAsTemplate,
}: CanvasToolbarProps) {
  return (
    <div className="absolute top-14 left-3 z-10 flex items-center gap-0.5 rounded-lg border border-border bg-card/95 backdrop-blur-sm shadow-sm p-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={onAutoLayout}
        className="w-8 h-8 text-muted-foreground hover:text-foreground"
        title="自动布局 (Shift+A)"
      >
        <LayoutDashboard className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onFitView}
        className="w-8 h-8 text-muted-foreground hover:text-foreground"
        title="适应画布 (Shift+F)"
      >
        <Maximize2 className="w-4 h-4" />
      </Button>
      <div className="w-px h-5 bg-border mx-0.5" />
      <Button
        variant="ghost"
        size="icon"
        onClick={onFromTemplate}
        className="w-8 h-8 text-muted-foreground hover:text-foreground"
        title="从模板创建"
      >
        <BookTemplate className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onSaveAsTemplate}
        className="w-8 h-8 text-muted-foreground hover:text-foreground"
        title="保存为模板"
      >
        <BookmarkPlus className="w-4 h-4" />
      </Button>
    </div>
  );
});
