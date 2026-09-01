import { Delete02Icon, Logout03Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { authApi } from '@/auth/api'
import { Button } from '@/components/ui/button'
import { notifyAction, toastAction } from '@/lib/actionToast'
import { promptSensitiveAction } from '@/lib/confirmAction'
import { useAuth } from '@/stores/auth'
import { SettingsGroup } from './SettingsComponents'
import { useSettingsDialog } from './store'

const ACCOUNT_DELETE_CONFIRMATION = '删除账号'

export function DataAccountSettingsPanel() {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const signOut = () => {
    const logout = authApi.signOut()
    useSettingsDialog.getState().setOpen(false)
    useAuth.getState().clear()
    void logout.catch(() => undefined)
  }

  const deleteAccount = async () => {
    if (confirming || deleting) return
    setConfirming(true)
    const confirmation = await promptSensitiveAction({
      title: '删除账号？',
      description: '此操作会撤销账号访问权，并匿名化姓名、邮箱和头像等身份信息。为保持共享学习记录完整，历史记录可能继续以匿名身份保留。',
      confirmLabel: '删除账号',
      cancelLabel: '取消',
      tone: 'destructive',
      inputLabel: `请输入“${ACCOUNT_DELETE_CONFIRMATION}”以确认`,
      inputPlaceholder: ACCOUNT_DELETE_CONFIRMATION,
      inputRequired: true,
    })
    setConfirming(false)
    if (confirmation === null) return
    if (confirmation !== ACCOUNT_DELETE_CONFIRMATION) {
      notifyAction({
        title: '确认文字不匹配',
        description: `请输入“${ACCOUNT_DELETE_CONFIRMATION}”后再继续。`,
        type: 'warning',
      })
      return
    }

    setDeleting(true)
    try {
      await toastAction(authApi.deleteAccount(), {
        loading: '正在删除账号…',
        success: '账号访问权已取消',
        error: '账号删除失败，请稍后再试',
      })
    } catch {
      setDeleting(false)
      return
    }

    setDeleting(false)
    useSettingsDialog.getState().setOpen(false)
    useAuth.getState().clear()
  }

  return (
    <div className="space-y-6">
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

      <SettingsGroup
        title="删除账号"
        description="此操作会撤销账号访问权并匿名化身份信息，且无法撤销。"
      >
        <div className="flex flex-col items-start gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-destructive">撤销账号访问并匿名化身份</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              历史学习与协作记录可能继续以匿名身份保留。
            </p>
          </div>
          <Button
            type="button"
            variant="destructive"
            disabled={confirming || deleting}
            onClick={() => void deleteAccount()}
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} data-icon="inline-start" />
            {deleting ? '正在删除…' : '删除账号'}
          </Button>
        </div>
      </SettingsGroup>
    </div>
  )
}
