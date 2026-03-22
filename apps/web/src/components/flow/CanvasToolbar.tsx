import { memo } from "react"
import {
  LayoutDashboard,
  Maximize2,
  BookTemplate,
  BookmarkPlus,
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface CanvasToolbarProps {
  onAutoLayout: () => void
  onFitView: () => void
  onFromTemplate: () => void
  onSaveAsTemplate: () => void
}

export const CanvasToolbar = memo(function CanvasToolbar({
  onAutoLayout,
  onFitView,
  onFromTemplate,
  onSaveAsTemplate,
}: CanvasToolbarProps) {
  return (
    <div className="absolute top-14 left-3 z-10 flex items-center gap-0.5 rounded-lg border border-border bg-card/95 backdrop-blur-sm shadow-sm p-0.5">
      <Button
        variant="ghost"
        size="icon"
        onClick={onAutoLayout}
        className="w-7 h-7"
        title="自动布局"
      >
        <LayoutDashboard className="w-3.5 h-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onFitView}
        className="w-7 h-7"
        title="适应画布"
      >
        <Maximize2 className="w-3.5 h-3.5" />
      </Button>
      <div className="w-px h-4 bg-border" />
      <Button
        variant="ghost"
        size="icon"
        onClick={onFromTemplate}
        className="w-7 h-7"
        title="从模板创建"
      >
        <BookTemplate className="w-3.5 h-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onSaveAsTemplate}
        className="w-7 h-7"
        title="保存为模板"
      >
        <BookmarkPlus className="w-3.5 h-3.5" />
      </Button>
    </div>
  )
})
