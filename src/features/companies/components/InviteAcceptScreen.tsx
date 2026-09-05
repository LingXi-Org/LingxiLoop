import { Button } from '@/components/ui/button'
import { companiesApi } from '@/features/companies/api'
import { learningApi } from '@/features/learning/api'
import { authApi } from '@/auth/api'
import type { ApiProjectInvitationAccept, ApiProjectInvitationPreview } from '@/features/learning/contracts'
import type { ApiInvitationPreview } from '@/features/companies/contracts'
/**
 * InviteAcceptScreen — the "you've been invited to <workspace>" landing
 * page. Renders when the URL carries an invite token via either:
 *   • path:   /invite/<token>           (web)
 *   • hash:   #invite=<token>           (electron deep link)
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
import { selectLearningSpace } from '@/features/knowledge/workspace'
import { userFacingError } from '@/lib/userFacingError'
import { ProductLogo } from '@/components/Avatar'
import { WindowDragStrip } from '@/components/WindowDragStrip'

function inviteRoleLabel(role: string): string {
  switch (role.toLowerCase()) {
    case 'learner': return '学习者'
    case 'teacher': return '课程创建者'
    case 'owner': return '所有者'
    case 'admin': return '管理员'
    default: return '成员'
  }
}

/** Look at the URL path or app deep-link hash for an invite token. Returns
 *  the token + a no-op cleanup that scrubs it from the URL so a refresh
 *  doesn't trip the same handler again. */
export function consumeInviteFromUrl(): { token: string; clear: () => void } | null {
  const url = new URL(window.location.href)
  const projectPathMatch = url.pathname.match(/^\/invite\/project\/([^/?#]+)\/?$/)
  if (projectPathMatch) {
    const token = `project:${decodeURIComponent(projectPathMatch[1])}`
    const clear = () => {
      try { history.replaceState(null, '', `${url.origin}/${url.search}${url.hash}`) } catch { /* swallow */ }
    }
    return { token, clear }
  }
  const pathMatch = url.pathname.match(/^\/invite\/([^/?#]+)\/?$/)
  if (pathMatch) {
    const token = decodeURIComponent(pathMatch[1])
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
    const token = decodeURIComponent(fromHash)
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
      const r = projectInvite ? await learningApi.acceptProjectInvitation(rawToken) : await companiesApi.acceptInvitation(rawToken)
      const auth = useAuth.getState()
      if (auth.user) {
        const companies = auth.companies.some((company) => company.id === r.company.id)
          ? auth.companies
          : [...auth.companies, r.company]
        setMe(auth.user, companies, auth.personalCompanyId ?? auth.activeCompanyId ?? r.company.id)
      } else {
        setActive(r.company.id)
      }
      if (projectInvite && 'course' in r) {
        const accepted = r as ApiProjectInvitationAccept
        await selectLearningSpace({ companyId: accepted.company.id, projectId: accepted.course.projectId })
        useApp.getState().selectConversation(accepted.course.studyRoomId)
      } else {
        setActive(r.company.id)
      }
      void authApi.me().then((me) => {
        setMe(me.user, me.companies, me.activeCompanyId)
        setServerCapabilities(me.serverCapabilities)
      }).catch(() => undefined)
      // Both supported surfaces enter the workspace immediately. The Web app
      // is a complete product surface, not a Desktop-download handoff.
      onDone()
    } catch (e) {
      setAcceptErr(userFacingError(e, '暂时无法接受邀请，请稍后重试。'))
    } finally {
      setBusy(false)
    }
  }, [projectInvite, rawToken, setMe, setServerCapabilities, setActive, onDone])

  // Auto-accept the moment we have a session AND the preview is `valid`.
  // Saves a redundant click when the user just signed in to redeem the
  // invite — the page goes preview → busy → into the workspace fluidly.
  useEffect(() => {
    if (!tokenStr) return
    if (preview?.status !== 'valid') return
    if (busy) return
    void accept()
  }, [tokenStr, preview, busy, accept])

  const inv = preview?.invitation
  const companyName = inv?.company.name ?? 'LingxiLoop'
  const course = inv && 'course' in inv ? inv.course : null
  const inviter = inv?.inviterName ?? '一位成员'
  const signedIn = !!tokenStr && !!tokenUserId

  return (
    <div className="fixed inset-0 grid place-items-center p-6" style={{ background: 'var(--paper)' }}>
      <WindowDragStrip />
      <div
        className="w-full max-w-[420px] rounded-[18px] p-8 flex flex-col items-center gap-6"
        style={{
          background: 'var(--cloud)',
          border: '1px solid var(--ink-100)',
          boxShadow: '0 30px 60px -30px color-mix(in srgb, var(--foreground) 20%, transparent), 0 0 0 1px color-mix(in srgb, var(--border) 40%, transparent)',
        }}
      >
        <ProductLogo size={56} rounded />

        {previewErr && (
          <ErrorBlock
            title="无法加载此邀请"
            body={previewErr}
            onDismiss={onDone}
          />
        )}

        {!preview && !previewErr && (
          <div className="text-[13px] text-ink-400 italic font-display">正在检查邀请…</div>
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
            body={`${companyName} 的所有者已取消此邀请。请让他们发送新的邀请。`}
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
          <ErrorBlock
            title="该邀请已被使用"
            body={`前往 ${companyName} 的链接只能使用一次，已被其他人使用。`}
            onDismiss={onDone}
          />
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
            <h1 className="font-display text-[20px] text-ink-900">账号错误</h1>
            <p className="text-[13px] text-ink-500 font-display italic leading-relaxed">
              此邀请 <b className="not-italic text-ink-900">{companyName}</b> 保留用于{' '}
              <b className="not-italic text-ink-900">{inv.email}</b>，但你当前登录的是{' '}
              <b className="not-italic text-ink-900">{user?.email}</b>。请退出后使用受邀邮箱重新登录。
            </p>
            <Button
              onClick={() => { useAuth.getState().clear() }}
              className="px-4 py-2 rounded-[10px] text-[13px] font-semibold transition"
              style={{ background: 'var(--ink-700)', color: 'white' }}
            >退出登录</Button>
          </div>
        )}

        {preview && preview.status === 'already_member' && (
          <AlreadyMemberBlock
            companyName={companyName}
            onSwitchInBrowser={async () => {
              if (inv) {
                if ('course' in inv) {
                  await selectLearningSpace({ companyId: inv.company.id, projectId: inv.course.projectId })
                  useApp.getState().selectConversation(inv.course.studyRoomId)
                } else {
                  setActive(inv.company.id)
                }
              }
              onDone()
            }}
          />
        )}

        {preview && preview.status === 'valid' && inv && (
          <div className="flex flex-col items-center gap-5 text-center w-full">
            <div className="space-y-1">
              <div className="text-[12.5px] text-ink-400 font-display italic">
                {inviter} 邀请您
              </div>
              <h1 className="font-display text-[24px] tracking-tight text-ink-900">
                {course?.name ?? companyName}
              </h1>
              {course && <div className="text-[12px] text-ink-400">{companyName} · 课程对话</div>}
              {inv.note && (
                <div className="text-[12.5px] text-ink-500 font-display italic mt-2 px-3 py-2 rounded-[10px]"
                     style={{ background: 'var(--cloud)' }}>
                  "{inv.note}"
                </div>
              )}
            </div>

            {!signedIn ? (
              <SignInToAccept token={token_} />
            ) : (
              <>
                <Button
                  onClick={() => void accept()}
                  disabled={busy}
                  className="w-full py-3 rounded-[12px] text-[14px] font-semibold text-white transition disabled:opacity-60"
                  style={{
                    background: 'var(--skype)',
                    boxShadow: '0 6px 16px -4px color-mix(in srgb, var(--primary) 50%, transparent)',
                  }}
                >{busy ? '正在加入…' : `以${inviteRoleLabel(inv.role)}身份加入 ${companyName}`}</Button>
                <Button
                  onClick={onDone}
                  className="text-[12px] text-ink-400 hover:text-ink-700 transition font-display italic"
                >暂不</Button>
              </>
            )}

            {acceptErr && (
              <div className="text-[12px] text-coral-deep text-center max-w-full break-words">
                {acceptErr}
              </div>
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
      <h1 className="font-display text-[20px] text-ink-900">你已加入 {companyName}</h1>
      <p className="text-[12.5px] text-ink-500 font-display italic -mt-2">
        从上次离开的地方继续。
      </p>
      <div className="w-full flex flex-col gap-2.5">
        <Button
          onClick={onSwitchInBrowser}
          className="w-full py-3 rounded-[12px] text-[14px] font-semibold text-white transition"
          style={{ background: 'var(--skype)' }}
        >进入工作区</Button>
      </div>
    </div>
  )
}

function ErrorBlock({ title, body, onDismiss }: { title: string; body: string; onDismiss?: () => void }) {
  const tokenStr = useAuth((s) => s.authenticated)
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <h1 className="font-display text-[20px] text-ink-900">{title}</h1>
      <p className="text-[13px] text-ink-500 font-display italic leading-relaxed">{body}</p>
      {tokenStr && onDismiss && (
        <Button
          onClick={onDismiss}
          className="px-4 py-2 rounded-[10px] text-[12.5px] font-semibold text-ink-700 transition"
          style={{ background: 'var(--cloud)', border: '1px solid var(--ink-100)' }}
        >继续使用 LingxiLoop</Button>
      )}
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
      <div className="text-[12.5px] text-ink-500 font-display italic text-center">
        登录以接受此邀请
      </div>
      <Button
        type="button"
        onClick={go}
        className="h-11 rounded-[10px] transition-colors flex items-center justify-center gap-3 text-[14px] font-semibold"
      >
        使用邮箱继续
      </Button>
      <div className="text-[10.5px] text-ink-300 text-center font-display italic">
        注册后验证邮箱即可加入受邀空间。
      </div>
    </div>
  )
}
