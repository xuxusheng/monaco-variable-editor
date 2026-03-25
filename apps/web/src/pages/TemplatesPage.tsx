import { BookTemplate } from "lucide-react";

export function TemplatesPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
      <div className="flex items-center gap-3 text-muted-foreground">
        <BookTemplate className="size-8" />
        <div>
          <h1 className="text-2xl font-semibold text-foreground">模板库</h1>
          <p className="text-sm text-muted-foreground">浏览和管理可用的工作流模板</p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">此功能即将上线</p>
    </div>
  );
}
