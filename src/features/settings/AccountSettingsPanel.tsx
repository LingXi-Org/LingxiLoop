import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/stores/auth'
import { SettingsGroup, SettingsPanelSkeleton, SettingsRow } from './SettingsComponents'

export function AccountSettingsPanel() {
  const user = useAuth((state) => state.user)

  if (!user) return <SettingsPanelSkeleton rows={4} />

  const fallback = user.name.trim().slice(0, 2).toLocaleUpperCase() || '我'

  return (
    <SettingsGroup
      title="账号资料"
      description="这些资料由登录服务提供，在 LingxiLoop 中仅供查看。"
    >
      <div className="flex items-center gap-3 px-4 py-4">
        <Avatar className="size-11">
          <AvatarFallback>{fallback}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
            <Badge variant="secondary">只读</Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
      </div>
      <SettingsRow title="姓名"><span className="max-w-64 truncate text-sm text-muted-foreground">{user.name}</span></SettingsRow>
      <SettingsRow title="邮箱地址"><span className="max-w-64 truncate text-sm text-muted-foreground">{user.email}</span></SettingsRow>
      {typeof user.emailVerified === 'boolean' && (
        <SettingsRow title="邮箱状态">
          <Badge variant={user.emailVerified ? 'secondary' : 'outline'}>
            {user.emailVerified ? '已验证' : '未验证'}
          </Badge>
        </SettingsRow>
      )}
      <SettingsRow title="登录方式"><span className="text-sm text-muted-foreground">灵犀账号</span></SettingsRow>
    </SettingsGroup>
  )
}
