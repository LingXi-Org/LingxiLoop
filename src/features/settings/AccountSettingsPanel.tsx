import { http } from '@/api/core/http'
import { useState } from 'react'
import { authApi } from '@/auth/api'
import { Button } from '@/components/ui/button'
import { companiesApi } from '@/features/companies/api'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import { userFacingError } from '@/lib/userFacingError'
import { AvatarEditor, type AvatarInput } from './AvatarEditor'
import { resolveUserAvatarUrl } from '@/lib/userAvatar'
import { clearAvatarCache } from '@/lib/avatarCache'
import { useParticipants } from '@/features/agents/state'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/stores/auth'
import { SettingsPanelSkeleton } from './SettingsComponents'

export function AccountSettingsPanel() {
  const user = useAuth((state) => state.user)
  const company = useAuth((state) => state.companies[0])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!user) return <SettingsPanelSkeleton rows={4} />

  const save = async (input: AvatarInput) => {
    const avatar = await http<{ avatarUrl: string; avatarSeed: string | null }>('/me/avatar', { method: 'PUT', body: JSON.stringify(input) })
    if (useAuth.getState().user?.id !== user.id) return
    useAuth.setState((state) => ({ user: state.user ? { ...state.user, ...avatar } : null }))
    clearAvatarCache()
    void useParticipants.getState().refresh()
    window.dispatchEvent(new Event('lingxiloop:growth-updated'))
  }

  const leave = async () => {
    if (!company || !await confirmSensitiveAction({ title: '退出公司？', description: '账号将立即停用。公司保留课程和学习记录；再次加入需要退出后创建的新邀请。最后一位管理员须先交接。', confirmLabel: '退出公司', tone: 'destructive' })) return
    setBusy(true)
    setError('')
    try {
      await companiesApi.leaveCompany(company.id)
      useAuth.getState().clear()
      await authApi.signOut()
    } catch (reason) {
      setError(userFacingError(reason, '退出公司失败'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="账号资料" className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-4 p-5 sm:p-6">
        <AvatarEditor kind="user" currentUrl={resolveUserAvatarUrl(user.avatarUrl, user.id)} onSave={save} />
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="break-words text-base font-semibold text-foreground">{user.name}</h3>
          <p className="break-all text-sm text-muted-foreground">{user.email}</p>
        </div>
      </div>
      <dl className="grid border-t border-border sm:grid-cols-2">
        <div className="space-y-2 px-5 py-4 sm:px-6">
          <dt className="text-xs text-muted-foreground">登录方式</dt>
          <dd className="text-sm font-medium text-foreground">灵犀账号</dd>
        </div>
        {typeof user.emailVerified === 'boolean' && (
          <div className="space-y-2 border-t border-border px-5 py-4 sm:border-s sm:border-t-0 sm:px-6">
            <dt className="text-xs text-muted-foreground">邮箱状态</dt>
            <dd><Badge variant={user.emailVerified ? 'secondary' : 'outline'}>{user.emailVerified ? '已验证' : '未验证'}</Badge></dd>
          </div>
        )}
        {company && <>
          <div className="space-y-2 border-t border-border px-5 py-4 sm:px-6"><dt className="text-xs text-muted-foreground">公司</dt><dd className="text-sm font-medium text-foreground">{company.name}</dd></div>
          <div className="space-y-2 border-t border-border px-5 py-4 sm:border-s sm:px-6"><dt className="text-xs text-muted-foreground">成员身份</dt><dd className="text-sm font-medium text-foreground">{company.role === 'teacher' ? '教师' : '学生'}{company.isAdmin ? ' · 公司管理员' : ''}</dd></div>
          <div className="flex items-center justify-between gap-4 border-t border-border px-5 py-4 sm:px-6"><dt className="text-xs text-muted-foreground">退出公司</dt><dd><Button variant="destructive" disabled={busy} onClick={() => void leave()}>退出公司</Button></dd></div>
          {error && <div role="alert" className="border-t border-border px-5 py-3 text-sm text-destructive sm:px-6">{error}</div>}
        </>}
      </dl>
    </section>
  )
}