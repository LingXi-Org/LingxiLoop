import { Logout03Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { authApi } from '@/auth/api'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/stores/auth'
import { useWorkspace } from '@/features/knowledge/workspace'
import { RemovedConversationsSettings } from './RemovedConversationsSettings'
import { SettingsGroup } from './SettingsComponents'
import { useSettingsDialog } from './store'

export function DataAccountSettingsPanel() {
  const userId = useAuth(state => state.user?.id)
  const companyId = useAuth(state => state.activeCompanyId)
  const projectId = useWorkspace(state => state.selectedId)
  const open = useSettingsDialog(state => state.open)
  const viewEpoch = useSettingsDialog(state => state.dataAccountEpoch)
  const signOut = () => {
    const logout = authApi.signOut()
    useSettingsDialog.getState().setOpen(false)
    useAuth.getState().clear()
    void logout.catch(() => undefined)
  }

  return (
    <div className="space-y-6">
      {open && userId && companyId && projectId && <RemovedConversationsSettings key={`${userId}:${companyId}:${projectId}:${viewEpoch}`} />}
      <SettingsGroup title="登录状态" description="退出当前设备上的 LingxiLoop 登录。">
        <div className="flex flex-col items-start gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">退出登录</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">退出后可使用灵犀账号重新登录。</p>
          </div>
          <Button type="button" variant="outline" onClick={signOut}>
            <HugeiconsIcon icon={Logout03Icon} strokeWidth={2} data-icon="inline-start" />
            退出登录
          </Button>
        </div>
      </SettingsGroup>
    </div>
  )
}
