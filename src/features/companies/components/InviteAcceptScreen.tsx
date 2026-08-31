import { Button } from '@/components/ui/button'
import { companiesApi } from '@/features/companies/api'
import { learningApi } from '@/features/learning/api'
import { authApi } from '@/auth/api'
import { getServerOrigin } from '@/api/core/http'
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
 *   2. If not signed in: show the same OAuth buttons AuthScreen uses, but
 *      we DON'T scrub the invite token from the URL — the AuthGate's
 *      OAuth-fragment handler stays scoped to `#token=…`, so the invite
 *      token survives the round-trip and we resume on return.
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
import { isElectron, isWebAppHost } from '@/lib/runtime'
import { userFacingError } from '@/lib/userFacingError'
import { ProductLogo } from '@/components/Avatar'
import { GetDesktopAppLink } from '@/components/GetDesktopAppLink'
import { WindowDragStrip } from '@/components/WindowDragStrip'

const INVITE_TOKEN_KEY = 'lingxiloop.pending-invite'

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
 *  doesn't trip the same handler again. The token is stashed in
 *  localStorage before scrubbing so the OAuth round-trip can pick it
 *  back up on return. */
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

/** Persist a pending invite token across the OAuth round-trip. The
 *  AuthScreen redirects the browser to LingxiIdentity — when the
 *  user lands back on AUTH_DONE_URL the path/hash is reset to the auth
 *  fragment shape, and `consumeInviteFromUrl` won't find the token.
 *  Pulling it from localStorage instead keeps the flow seamless. */
export function stashPendingInvite(token: string): void {
  try { localStorage.setItem(INVITE_TOKEN_KEY, token) } catch { /* swallow */ }
}

export function getPendingInvite(): string | null {
  try { return localStorage.getItem(INVITE_TOKEN_KEY) } catch { return null }
}

export function clearPendingInvite(): void {
  try { localStorage.removeItem(INVITE_TOKEN_KEY) } catch { /* swallow */ }
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
  const tokenStr = useAuth((s) => s.token)
  const setMe = useAuth((s) => s.setMe)
  const setServerCapabilities = useAuth((s) => s.setServerCapabilities)
  const setActive = useAuth((s) => s.setActiveCompany)
  const user = useAuth((s) => s.user)

  const [preview, setPreview] = useState<ApiInvitationPreview | ApiProjectInvitationPreview | null>(null)
  const [previewErr, setPreviewErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [acceptErr, setAcceptErr] = useState<string | null>(null)
  // After a successful accept in the WEB build, we stop on a success
  // screen with "Open in LingxiLoop app" + "Download" CTAs instead of
  // dropping the user straight into the SPA. The desktop app skips
  // this — they're already in the app, so we route them in.
  const [joinedCompany, setJoinedCompany] = useState<{ id: string; name: string; slug: string } | null>(null)

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
      clearPendingInvite()
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
    if (joinedCompany) return  // already redeemed — don't re-POST in a loop
    void accept()
  }, [tokenStr, preview, busy, accept, joinedCompany])

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
          boxShadow: '0 30px 60px -30px rgba(10, 30, 60, 0.20), 0 0 0 1px rgba(0, 80, 140, 0.04)',
        }}
      >
        <ProductLogo size={56} rounded />

        {joinedCompany && (
          <JoinedSuccessBlock
            companyName={joinedCompany.name}
            onContinueInBrowser={() => { setJoinedCompany(null); onDone() }}
          />
        )}

        {!joinedCompany && previewErr && (
          <ErrorBlock
            title="无法加载此邀请"
            body={previewErr}
            onDismiss={() => { clearPendingInvite(); onDone() }}
          />
        )}

        {!joinedCompany && !preview && !previewErr && (
          <div className="text-[13px] text-ink-400 italic font-display">正在检查邀请…</div>
        )}

        {!joinedCompany && preview && preview.status === 'not_found' && (
          <ErrorBlock
            title="该邀请链接无效"
            body="链接可能输入有误。请让邀请人重新发送一条新的邀请链接。"
            onDismiss={() => { clearPendingInvite(); onDone() }}
          />
        )}

        {!joinedCompany && preview && preview.status === 'revoked' && (
          <ErrorBlock
            title="该邀请已被撤销"
            body={`${companyName} 的所有者已取消此邀请。请让他们发送新的邀请。`}
            onDismiss={() => { clearPendingInvite(); onDone() }}
          />
        )}

        {!joinedCompany && preview && preview.status === 'expired' && (
          <ErrorBlock
            title="该邀请已过期"
            body={`${companyName} 的邀请已超过有效期，请让邀请人重新发送。`}
            onDismiss={() => { clearPendingInvite(); onDone() }}
          />
        )}

        {!joinedCompany && preview && preview.status === 'consumed' && (
          <ErrorBlock
            title="该邀请已被使用"
            body={`前往 ${companyName} 的链接只能使用一次，已被其他人使用。`}
            onDismiss={() => { clearPendingInvite(); onDone() }}
          />
        )}

        {!joinedCompany && preview && preview.status === 'archived' && (
          <ErrorBlock
            title="该课程已归档"
            body="归档课程为只读状态，无法再接受新成员。"
            onDismiss={() => { clearPendingInvite(); onDone() }}
          />
        )}

        {!joinedCompany && preview && preview.status === 'wrong_email' && inv && (
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

        {!joinedCompany && preview && preview.status === 'already_member' && (
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
              clearPendingInvite()
              onDone()
            }}
          />
        )}

        {!joinedCompany && preview && preview.status === 'valid' && inv && (
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
                    boxShadow: '0 6px 16px -4px rgba(0, 168, 240, 0.5)',
                  }}
                >{busy ? '正在加入…' : `以${inviteRoleLabel(inv.role)}身份加入 ${companyName}`}</Button>
                <Button
                  onClick={() => { clearPendingInvite(); onDone() }}
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
/** Best-effort lingxiloop:// deep link. If the OS protocol handler isn't
 *  registered, browsers fail silently (no broken-page) and the user just
 *  stays put — at which point the visible Download button below is the
 *  next thing they reach for. */
function tryOpenDesktopApp() {
  try { location.href = 'lingxiloop://open' } catch { /* swallow */ }
}

/** Success state shown after a successful accept in the WEB build. Offers
 *  "Open in LingxiLoop app" (best-effort lingxiloop:// deep link) and a download
 *  CTA, with "continue in browser" as the soft fallback. */
function JoinedSuccessBlock({ companyName, onContinueInBrowser }: {
  companyName: string
  onContinueInBrowser: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-5 text-center w-full">
      <div
        className="w-12 h-12 rounded-full grid place-items-center"
        style={{ background: 'var(--sky-100)', color: 'var(--skype-deep)' }}
        aria-hidden
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <div className="space-y-1">
        <h1 className="font-display text-[22px] tracking-tight text-ink-900">
          欢迎来到 {companyName}
        </h1>
        <p className="text-[12.5px] text-ink-500 font-display italic">
          你已成功加入，可直接前往 LingxiLoop 工作区。
        </p>
      </div>
      <div className="w-full flex flex-col gap-2.5">
        <Button
          onClick={tryOpenDesktopApp}
          className="w-full py-3 rounded-[12px] text-[14px] font-semibold text-white transition"
          style={{
            background: 'var(--skype)',
            boxShadow: '0 6px 16px -4px rgba(0, 168, 240, 0.5)',
          }}
        >在 LingxiLoop 应用程序中打开</Button>
        <GetDesktopAppLink variant="button-secondary" />
        {!isWebAppHost && (
          <Button
            onClick={onContinueInBrowser}
            className="text-[12px] text-ink-400 hover:text-ink-700 transition font-display italic mt-1"
          >在浏览器中继续</Button>
        )}
      </div>
    </div>
  )
}

/** Shown when the preview reports `already_member` — the signed-in user
 *  is already in the target workspace, so accepting is a no-op. The
 *  practical reason they hit this screen is usually "I clicked the
 *  invite link on a new device / fresh browser" — so we lead with
 *  "Open in desktop" + "Download" to cover the install case, and keep
 *  the "switch in browser" path as a soft tertiary. */
function AlreadyMemberBlock({ companyName, onSwitchInBrowser }: {
  companyName: string
  onSwitchInBrowser: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-5 text-center w-full">
      <h1 className="font-display text-[20px] text-ink-900">你已加入 {companyName}</h1>
      <p className="text-[12.5px] text-ink-500 font-display italic -mt-2">
        从上次离开的地方继续；你可以在此设备或任何安装了 LingxiLoop 的设备上使用。
      </p>
      <div className="w-full flex flex-col gap-2.5">
        <Button
          onClick={tryOpenDesktopApp}
          className="w-full py-3 rounded-[12px] text-[14px] font-semibold text-white transition"
          style={{
            background: 'var(--skype)',
            boxShadow: '0 6px 16px -4px rgba(0, 168, 240, 0.5)',
          }}
        >在 LingxiLoop 桌面端打开</Button>
        <GetDesktopAppLink variant="button-secondary" />
        <Button
          onClick={onSwitchInBrowser}
          className="text-[12px] text-ink-400 hover:text-ink-700 transition font-display italic mt-1"
        >在浏览器中继续</Button>
      </div>
    </div>
  )
}

function ErrorBlock({ title, body, onDismiss }: { title: string; body: string; onDismiss?: () => void }) {
  const tokenStr = useAuth((s) => s.token)
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
  const [busy, setBusy] = useState<'lingxi' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const go = (provider: 'lingxi') => {
    setBusy(provider)
    setError(null)
    const rawToken = token.startsWith('project:') ? token.slice('project:'.length) : token
    // Persist BEFORE redirect so the post-OAuth landing can resume here.
    stashPendingInvite(token)
    if (isElectron && window.lingxiloop?.auth) {
      const origin = getServerOrigin()
      if (!origin) {
        setBusy(null)
        setError('桌面端未配置服务地址，无法继续登录')
        return
      }
      // Arm a single-use nonce (anti session-fixation — see AuthScreen). The
      // nonce rides the return URL's query and must match on the inbound token.
      const auth = window.lingxiloop.auth
      void (async () => {
        let done = 'http://127.0.0.1:47823/auth/done'
        if (!auth.arm) {
          setBusy(null)
          setError('当前桌面版本不支持安全登录会话，请更新后重试')
          return
        }
        try {
          const nonce = await auth.arm()
          if (nonce) done += `?n=${encodeURIComponent(nonce)}`
        } catch (reason) {
          setBusy(null)
          setError(userFacingError(reason, '无法建立安全的桌面登录会话，请重试。'))
          return
        }
        void auth.openExternal(authApi.startUrl({
          returnUrl: done,
          inviteToken: rawToken,
          inviteKind: token.startsWith('project:') ? 'project' : 'company',
        }))
      })()
      return
    }
    location.assign(authApi.startUrl({
      inviteToken: rawToken,
      inviteKind: token.startsWith('project:') ? 'project' : 'company',
    }))
  }
  return (
    <div className="w-full flex flex-col gap-2.5">
      <div className="text-[12.5px] text-ink-500 font-display italic text-center">
        登录以接受此邀请
      </div>
      {error && <div role="alert" className="rounded-lg bg-coral-soft px-3 py-2 text-center text-[12px] text-coral-deep">{error}</div>}
      <Button
        type="button"
        onClick={() => go('lingxi')}
        disabled={busy !== null}
        className="auth-provider-button auth-provider-lingxi h-11 rounded-[10px] transition-colors flex items-center justify-center gap-3 text-[14px] font-semibold disabled:opacity-60"
      >
        {busy === 'lingxi' ? '正在跳转…' : '使用灵犀账号继续'}
      </Button>
      <div className="text-[10.5px] text-ink-300 text-center font-display italic">
        我们仅使用第三方账号验证你的身份，不会代你发布内容，也不会索取额外权限。
      </div>
      <div className="text-[11.5px] text-ink-400 text-center font-display italic pt-1">
        还没有桌面应用程序？{' '}
        <GetDesktopAppLink variant="text" label="获取 LingxiLoop" />
      </div>
    </div>
  )
}
