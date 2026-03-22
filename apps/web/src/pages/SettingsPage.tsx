import { Settings } from "lucide-react"

export function SettingsPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
      <div className="flex items-center gap-3 text-muted-foreground">
        <Settings className="size-8" />
        <div>
          <h1 className="text-2xl font-semibold text-foreground">项目空间设置</h1>
          <p className="text-sm text-muted-foreground">管理您的项目配置和偏好</p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">此功能即将上线</p>
    </div>
  )
}
