import { Button } from '@/components/ui/button'
import { companiesApi } from '@/features/companies/api'
import { learningApi } from '@/features/learning/api'
import { authApi } from '@/auth/api'
import type { ApiProjectInvitationPreview } from '@/features/learning/contracts'
import type { ApiInvitationPreview } from '@/features/companies/contracts'
/**
 * InviteAcceptScreen — the "you've been invited to <workspace>" landing
 * page. Renders when the URL carries an invite token via either:
 *   • path:   /invite/<token>           (web)
 *   • hash:   #invite=<token>           (legacy deep link)
 *
 * Flow:
 *   1. On mount, parse the token from the URL and call previewInvitation —
 *      unauthenticated callers learn the workspace name + inviter so the
 *      page reads "Iris invited you to Sunfire" before they sign in.
 *   2. If not signed in: open invitation-bound Better Auth registration.
 *   3. Once signed in, show a "Join <workspace>" CTA. On click, POST the
 *      accept endpoint, append the company to the local auth store, and
 *      switch to it — at which point the AuthedApp key changes and the
 *      whole shell remounts on the new tenant.
 *
 * Edge cases the preview surface:
 *   • revoked / expired / consumed — terminal, show explainer.
 *   • wrong_email — the signed-in account's email doesn't match the
 *     locked-to email. Tell the user to sign out and sign in with the
 *     right account.
 *   • already_member — they already belong; just route them in.
 *   • not_found — bad link.
 */
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/stores/auth'
import { useApp } from '@/stores/app'
import { userFacingError } from '@/lib/userFacingError'
import { ProductLogo } from '@/components/ProductLogo'
import { writeWebDestination } from '@/lib/webNavigation'

function inviteRoleLabel(role: string): string {
  switch (role.toLowerCase()) {
    case 'learner': return '学习者'
    case 'teacher': return '教师'
    case 'student': return '学生'
    default: return '成员'
  }
}

/** Look at the URL path or app deep-link hash for an invite token. Returns
 *  the token + a no-op cleanup that scrubs it from the URL so a refresh
 *  doesn't trip the same handler again. */
export function consumeInviteFromUrl(): { token: string; clear: () => void } | null {
  const url = new URL(window.location.href)
  const decodePathToken = (token: string) => {
    try { return decodeURIComponent(token) } catch { return token }
  }
  const projectPathMatch = url.pathname.match(/^\/invite\/project\/([^/?#]+)\/?$/)
  if (projectPathMatch) {
    const token = `project:${decodePathToken(projectPathMatch[1])}`
    const clear = () => {
      try { history.replaceState(null, '', `${url.origin}/${url.search}${url.hash}`) } catch { /* swallow */ }
    }
    return { token, clear }
  }
  const pathMatch = url.pathname.match(/^\/invite\/([^/?#]+)\/?$/)
  if (pathMatch) {
    const token = decodePathToken(pathMatch[1])
    const clear = () => {
      // Drop the /invite/<token> prefix while preserving any query / hash
      // that was on the URL.
      const nextUrl = `${url.origin}/${url.search}${url.hash}`
      try { history.replaceState(null, '', nextUrl) } catch { /* swallow */ }
    }
    return { token, clear }
  }
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''))
  const fromHash = hashParams.get('invite')
  if (fromHash) {
    const token = fromHash
    const clear = () => {
      hashParams.delete('invite')
      const remaining = hashParams.toString()
      const nextUrl = `${url.origin}${url.pathname}${url.search}${remaining ? '#' + remaining : ''}`
      try { history.replaceState(null, '', nextUrl) } catch { /* swallow */ }
    }
    return { token, clear }
  }
  return null
}

interface Props {
  token: string
  onDone: () => void
}

export function InviteAcceptScreen({ token, onDone }: Props) {
  const token_ = token
  const projectInvite = token_.startsWith('project:')
  const rawToken = projectInvite ? token_.slice('project:'.length) : token_
  const tokenUserId = useAuth((s) => s.user?.id ?? null)
  const tokenStr = useAuth((s) => s.authenticated)
  const setMe = useAuth((s) => s.setMe)
  const setServerCapabilities = useAuth((s) => s.setServerCapabilities)
  const setActive = useAuth((s) => s.setActiveCompany)
  const user = useAuth((s) => s.user)

  const [preview, setPreview] = useState<ApiInvitationPreview | ApiProjectInvitationPreview | null>(null)
  const [previewErr, setPreviewErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [acceptErr, setAcceptErr] = useState<string | null>(null)
  const loadPreview = useCallback(async () => {
    setPreviewErr(null)
    try {
      const r = projectInvite ? await learningApi.previewProjectInvitation(rawToken) : await companiesApi.previewInvitation(rawToken)
      setPreview(r)
    } catch (e) {
      setPreviewErr(userFacingError(e, '暂时无法读取邀请，请稍后重试。'))
    }
  }, [projectInvite, rawToken])

  useEffect(() => { void loadPreview() }, [loadPreview, tokenStr])

  const accept = useCallback(async () => {
    setBusy(true); setAcceptErr(null)
    try {
      await authApi.acceptInvitation(rawToken, projectInvite ? 'project' : 'company')
      const me = await authApi.me()
      useAuth.getState().setAuthenticated(me.user, me.activeCompanyId)
      setMe(me.user, me.companies, me.activeCompanyId)
      setServerCapabilities(me.serverCapabilities)
      // Both supported surfaces enter the workspace immediately. The Web app
      // is a complete product surface, not a Desktop-download handoff.
      onDone()
      const accepted = preview?.invitation
      if (accepted && 'course' in accepted) writeWebDestination({ projectId: accepted.course.projectId, view: 'conversations', conversationId: accepted.course.studyRoomId }, 'replace')
    } catch (e) {
      setAcceptErr(userFacingError(e, '暂时无法接受邀请，请稍后重试。'))
    } finally {
      setBusy(false)
    }
  }, [projectInvite, rawToken, setMe, setServerCapabilities, setActive, onDone, preview])

  // Auto-accept the moment we have a session AND the preview is `valid`.
  // Saves a redundant click when the user just signed in to redeem the
  // invite — the page goes preview → busy → into the workspace fluidly.
  useEffect(() => {
    if (!tokenStr) return
    if (preview?.status !== 'valid') return
    if (busy || acceptErr) return
    void accept()
  }, [tokenStr, preview, busy, acceptErr, accept])

  const inv = preview?.invitation
  const companyName = inv?.company.name ?? 'LingxiLoop'
  const course = inv && 'course' in inv ? inv.course : null
  const inviter = inv?.inviterName ?? '一位成员'
  const signedIn = !!tokenStr && !!tokenUserId

  return (
    <div className="fixed inset-0 grid place-items-center bg-muted/40 p-6 text-foreground">
      <div className="flex w-full max-w-[400px] flex-col items-center gap-6 rounded-2xl border border-border bg-card p-8">
        <ProductLogo size={48} rounded />

        {previewErr && (
          <ErrorBlock
            title="无法加载此邀请"
            body={previewErr}
            onDismiss={onDone}
          />
        )}

        {!preview && !previewErr && (
          <p role="status" className="text-sm text-muted-foreground">正在检查邀请…</p>
        )}

        {preview && preview.status === 'not_found' && (
          <ErrorBlock
            title="该邀请链接无效"
            body="链接可能输入有误。请让邀请人重新发送一条新的邀请链接。"
            onDismiss={onDone}
          />
        )}

        {preview && preview.status === 'revoked' && (
          <ErrorBlock
            title="该邀请已被撤销"
            body={`${companyName} 的邀请人已取消此邀请。请让他们发送新的邀请。`}
            onDismiss={onDone}
          />
        )}

        {preview && preview.status === 'expired' && (
          <ErrorBlock
            title="该邀请已过期"
            body={`${companyName} 的邀请已超过有效期，请让邀请人重新发送。`}
            onDismiss={onDone}
          />
        )}

        {preview && preview.status === 'consumed' && (
          <div className="space-y-3 text-center">
            <p className="text-sm leading-6 text-muted-foreground">该邀请名额已用完。如果此前已接受，可登录重试完成开户。</p>
            {signedIn ? <Button onClick={() => void accept()} disabled={busy}>重试完成加入</Button> : <SignInToAccept token={token_} />}
            {acceptErr && <p role="alert" className="text-sm text-destructive">{acceptErr}</p>}
          </div>
        )}

        {preview && preview.status === 'archived' && (
          <ErrorBlock
            title="该课程已归档"
            body="归档课程为只读状态，无法再接受新成员。"
            onDismiss={onDone}
          />
        )}

        {preview && preview.status === 'wrong_email' && inv && (
          <div className="flex flex-col items-center gap-4 text-center">
            <h1 className="font-heading text-xl font-semibold">账号错误</h1>
            <p className="text-sm leading-6 text-muted-foreground">
              此邀请 <b className="font-medium text-foreground">{companyName}</b> 保留用于{' '}
              <b className="font-medium text-foreground">{inv.email}</b>，但你当前登录的是{' '}
              <b className="font-medium text-foreground">{user?.email}</b>。请退出后使用受邀邮箱重新登录。
            </p>
            <Button variant="outline" onClick={() => { useAuth.getState().clear() }}>退出登录</Button>
          </div>
        )}

        {preview && preview.status === 'already_member' && (
          <AlreadyMemberBlock
            companyName={companyName}
            onSwitchInBrowser={async () => {
              if (inv) {
                if ('course' in inv) {
                  const { selectLearningSpace } = await import('@/features/knowledge/workspace')
                  await selectLearningSpace({ companyId: inv.company.id, projectId: inv.course.projectId })
                  useApp.getState().selectConversation(inv.course.studyRoomId)
                } else {
                  setActive(inv.company.id)
                }
              }
              onDone()
              if (inv && 'course' in inv) writeWebDestination({ projectId: inv.course.projectId, view: 'conversations', conversationId: inv.course.studyRoomId }, 'replace')
            }}
          />
        )}

        {preview && preview.status === 'valid' && inv && (
          <div className="flex flex-col items-center gap-5 text-center w-full">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{inviter} 邀请你加入</p>
              <h1 className="font-heading text-xl font-semibold">{course?.name ?? companyName}</h1>
              {course && <p className="text-xs text-muted-foreground">{companyName} · 课程对话</p>}
              {inv.note && <blockquote className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">“{inv.note}”</blockquote>}
            </div>

            {!signedIn ? (
              <SignInToAccept token={token_} />
            ) : (
              <>
                <Button size="lg" className="w-full" onClick={() => void accept()} disabled={busy}>{busy ? '正在加入…' : `以${inviteRoleLabel(inv.role)}身份加入 ${companyName}`}</Button>
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onDone}>暂不加入</Button>
              </>
            )}

            {acceptErr && (
              <p role="alert" className="max-w-full break-words text-center text-sm text-destructive">{acceptErr}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
function AlreadyMemberBlock({ companyName, onSwitchInBrowser }: {
  companyName: string
  onSwitchInBrowser: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-5 text-center w-full">
      <div className="space-y-1">
        <h1 className="font-heading text-xl font-semibold">你已加入 {companyName}</h1>
        <p className="text-sm text-muted-foreground">从上次离开的地方继续。</p>
      </div>
      <Button size="lg" className="w-full" onClick={onSwitchInBrowser}>进入工作区</Button>
    </div>
  )
}

function ErrorBlock({ title, body, onDismiss }: { title: string; body: string; onDismiss?: () => void }) {
  const tokenStr = useAuth((s) => s.authenticated)
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <h1 className="font-heading text-xl font-semibold">{title}</h1>
      <p className="text-sm leading-6 text-muted-foreground">{body}</p>
      {tokenStr && onDismiss && <Button variant="outline" onClick={onDismiss}>继续使用 LingxiLoop</Button>}
    </div>
  )
}

function SignInToAccept({ token }: { token: string }) {
  const go = () => {
    const rawToken = token.startsWith('project:') ? token.slice('project:'.length) : token
    const returnTo = token.startsWith('project:') ? `/invite/project/${encodeURIComponent(rawToken)}` : `/invite/${encodeURIComponent(rawToken)}`
    const parameters = new URLSearchParams({ mode: 'signup', invite: rawToken, inviteKind: token.startsWith('project:') ? 'project' : 'company', returnTo })
    location.assign(`/?${parameters}`)
  }
  return (
    <div className="w-full flex flex-col gap-2.5">
      <p className="text-center text-sm text-muted-foreground">登录以接受此邀请</p>
      <Button type="button" size="lg" className="w-full" onClick={go}>使用邮箱继续</Button>
      <p className="text-center text-xs text-muted-foreground">注册后验证邮箱即可加入受邀空间。</p>
    </div>
  )
}
