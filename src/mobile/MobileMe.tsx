import { useEffect, useMemo, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { cn } from '@/lib/utils'
import { useApp } from '@/stores/app'
import { useAuth, useMe } from '@/stores/auth'
import { useParticipants } from '@/stores/participants'
import { useConversations } from '@/stores/conversations'
import { useWhispers } from '@/stores/whispers'
import { usePrefs } from '@/stores/preferences'
import { getPushStatus, initPushNotifications, teardownPushNotifications, type PushStatus } from '@/lib/push'
import { api } from '@/api/client'
import type { Participant } from '@/types'

interface ToggleablePref { key: string; lbl: string; sub: string; default?: boolean }

const TOGGLE_PREFS: ToggleablePref[] = [
  { key: 'notify.push',          lbl: '推送通知',          sub: '应用在后台时显示横幅和角标', default: true },
  { key: 'notify.group_pull',    lbl: '群聊邀请通知',       sub: '智能体邀请你加入群聊时通知', default: true },
  { key: 'notify.mention',       lbl: '提及通知',           sub: '智能体提及你时通知', default: true },
  { key: 'ui.typing_indicators', lbl: '显示输入状态',       sub: '查看成员是否正在输入', default: true },
  { key: 'ui.reduce_motion',     lbl: '减少动态效果',       sub: '减少界面动画', default: false },
]

export function MobileMe() {
  const authUser = useAuth((s) => s.user)
  const meId = useMe()
  const companies = useAuth((s) => s.companies)
  const activeCompanyId = useAuth((s) => s.activeCompanyId)
  const byId = useParticipants((s) => s.byId)
  const convoList = useConversations((s) => s.list)
  const whisperList = useWhispers((s) => s.list)
  const prefs = usePrefs((s) => s.prefs)
  const autonomy = usePrefs((s) => s.autonomy)
  const setPref = usePrefs((s) => s.setPref)

  // Real "me" participant (carries Gravatar / status). Falls back to a
  // synthesized record from the auth user if the store hasn't hydrated yet.
  const me: Participant = useMemo(() => {
    const stored = meId ? byId[meId] : null
    if (stored) return stored
    return {
      id: authUser?.id ?? 'me',
      kind: 'human',
      name: authUser?.name ?? '我',
      initial: (authUser?.name ?? 'Y').charAt(0).toUpperCase(),
      avatarBg: 'linear-gradient(135deg, #FF7A6B, #F4B740)',
      status: 'avail',
    } as Participant
  }, [meId, byId, authUser])

  const agents = useMemo(
    () => Object.values(byId).filter((p): p is Participant => p.kind === 'agent' && !p.departedAt),
    [byId],
  )
  const activeCompany = companies.find((c) => c.id === activeCompanyId)

  const openAgentInfo = useApp((s) => s.openAgentInfo)
  // Warm one-line "you steward N agents across M rooms" copy. Beats a
  // 4-card dashboard grid as a homepage statement — the numbers are
  // there but they read as personal context, not KPIs.
  const stewardLine = useMemo(() => {
    const parts: string[] = []
    if (agents.length) parts.push(`${agents.length} 个 Agent`)
    if (convoList.length) parts.push(`${convoList.length} 个对话`)
    if (whisperList.length) parts.push(`${whisperList.length} 个私聊`)
    if (parts.length === 0) return '工作空间还很安静，邀请一些 Agent 开始协作吧。'
    return `正在管理 ${parts.join(' · ')}`
  }, [agents.length, convoList.length, whisperList.length])

  return (
    <section className="flex flex-col h-full overflow-hidden bg-paper">
      <div
        className="text-center pt-6 pb-6 px-5 border-b border-ink-100"
        style={{
          paddingTop: 'max(env(safe-area-inset-top), 24px)',
          // Soft sky wash — the previous coral radial read as a bright
          // red bloom behind the avatar and overpowered the page. A
          // gentle sky tint reads as "a quiet morning" instead.
          background: 'linear-gradient(180deg, var(--sky-50) 0%, var(--paper) 100%)',
        }}>
        <div className="mx-auto mb-3 inline-block">
          <Avatar p={me} size={92} />
        </div>
        <h2 className="font-display font-medium text-[28px] tracking-tight text-ink-900 leading-[1.1]" style={{ letterSpacing: '-0.028em' }}>
          {me.name}
        </h2>
        <div className="font-display italic text-[13px] text-ink-500 mt-0.5 mb-2.5">
          {authUser?.email ?? '团队成员'}
        </div>
        <div className="font-display italic text-[12.5px] text-ink-700 max-w-[280px] mx-auto leading-snug">
          {stewardLine}
        </div>
        {activeCompany && (
          <div className="mt-3 inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full bg-cloud border border-ink-100 text-[10.5px] text-ink-500 tracking-wider uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-avail" />
            {activeCompany.name}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto pb-20">
        {false && <Section title="你的团队">
          {agents.length === 0 ? (
            <div
              className="text-center bg-cloud rounded-[12px] py-5 px-4"
              style={{ border: '1px dashed var(--ink-100)' }}
            >
              <div className="font-display italic text-[13px] text-ink-500 leading-snug">
                A quiet workspace — no agents have joined yet.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {agents.slice(0, 8).map((a) => {
                const auto = autonomy[a.id]
                const threshold = auto?.threshold ?? 0.6
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => openAgentInfo(a.id)}
                    className="bg-cloud rounded-[14px] p-3 flex flex-col items-start gap-2 active:scale-[0.97] transition text-left"
                    style={{ border: '1px solid var(--ink-100)' }}
                  >
                    <div className="flex items-center gap-2.5 w-full min-w-0">
                      <Avatar p={a} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold text-ink-900 leading-tight truncate">{a.name}</div>
                        <div className="font-display italic text-[10.5px] text-ink-500 leading-tight truncate">
                          {a.role ?? 'agent'}
                        </div>
                      </div>
                    </div>
                    <div className="w-full flex items-center gap-1.5 mt-0.5">
                      <div className="h-[3px] rounded-full bg-ink-100 overflow-hidden flex-1">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${threshold * 100}%`,
                            background: 'linear-gradient(90deg, var(--whisper), var(--avail))',
                          }}
                        />
                      </div>
                      <span className="font-mono text-[9.5px] font-semibold text-ink-500 tabular-nums">
                        {threshold.toFixed(2)}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </Section>}

        {false && <Section title="推送通知">
          <PushStatusTile />
        </Section>}

        <Section title="偏好设置">
          <div className="bg-cloud rounded-[12px] divide-y divide-ink-100"
            style={{ border: '1px solid var(--ink-100)' }}>
            {TOGGLE_PREFS.map((it) => {
              const stored = prefs[it.key]
              const on = typeof stored === 'boolean' ? stored : (it.default ?? false)
              return (
                <button
                  key={it.key}
                  type="button"
                  onClick={() => void setPref(it.key, !on)}
                  className="w-full text-left flex items-center gap-3 p-3.5 active:bg-paper transition"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[13px] text-ink-900 leading-tight">{it.lbl}</div>
                    <div className="font-display italic text-[11px] text-ink-500 mt-0.5">{it.sub}</div>
                  </div>
                  <span className={cn('w-9 h-5 rounded-full relative shrink-0 transition-colors', on ? 'bg-skype' : 'bg-ink-200')}>
                    <span className={cn('absolute w-4 h-4 bg-white rounded-full top-0.5 transition-all', on ? 'left-[18px]' : 'left-0.5')}
                      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </span>
                </button>
              )
            })}
          </div>
        </Section>

        <div className="px-4 pt-2 pb-4 space-y-2">
          <button
            type="button"
            onClick={() => {
              // Flip auth state FIRST so the UI rerenders into the auth
              // screen the same frame the user tapped. Network teardown
              // (server logout + APNs token unregister) runs in the
              // background after — if either one hangs we don't strand
              // the user on a sign-in screen they can't get past.
              useAuth.getState().clear()
              void teardownPushNotifications().catch(() => { /* ignore */ })
              void api.authLogout().catch((e) => console.warn('[signout] server call failed', e))
            }}
            className="w-full py-3 px-4 rounded-[12px] text-[13px] font-semibold text-coral-deep transition text-left active:opacity-70"
            style={{ border: '1px solid rgba(255, 122, 107, 0.3)' }}
          >
            退出登录
            <span className="block font-display italic text-[11px] text-ink-500 mt-0.5">结束此设备上的登录状态</span>
          </button>
          <DeleteAccountButton />
        </div>
      </div>
    </section>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 pt-5">
      <h4 className="text-[10.5px] font-extrabold text-skype tracking-[0.14em] uppercase mb-2.5">↳ {title}</h4>
      {children}
    </div>
  )
}

/** Inline diagnostic tile that mirrors the in-process push state to
 *  the UI so users can SEE why notifications aren't arriving and
 *  re-trigger registration without quitting the app. */
function PushStatusTile() {
  const [status, setStatus] = useState<PushStatus>(() => getPushStatus())
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    // Cheap poll — the push module mutates module-local state and
    // doesn't emit events; a 1s interval is enough for the tile to
    // reflect a re-register click within a frame the user notices.
    const t = setInterval(() => setStatus(getPushStatus()), 1000)
    return () => clearInterval(t)
  }, [])

  if (!status.supported) {
    return (
      <div className="bg-cloud rounded-[12px] p-3.5 text-[12px] text-ink-500 font-display italic"
        style={{ border: '1px solid var(--ink-100)' }}>
        Push notifications run on the iOS / Android native shell — this
        web preview just uses live socket messages.
      </div>
    )
  }

  const perm = status.permission
  const permColor = perm === 'granted' ? 'var(--avail)'
    : perm === 'denied' ? 'var(--coral)'
    : perm === 'prompt' || perm === 'prompt-with-rationale' ? 'var(--gold)'
    : 'var(--ink-300)'
  const permLabel = perm === 'granted' ? 'Allowed'
    : perm === 'denied' ? 'Blocked'
    : perm === 'prompt' || perm === 'prompt-with-rationale' ? 'Not asked yet'
    : 'Unknown'
  const stepLabel: Record<typeof status.lastStep, string> = {
    idle:                 'init never ran (check the prefs toggle above)',
    'load-plugin':        'stuck loading the @capacitor/push-notifications plugin',
    'request-permission': 'stuck asking iOS for permission (system dialog blocked?)',
    register:             'stuck on APNs token request (entitlement / network)',
    done:                 'init completed — waiting for APNs to hand back a token',
  }

  const reregister = async (force: boolean) => {
    if (busy) return
    setBusy(true)
    try { await initPushNotifications({ force }) }
    finally {
      setBusy(false)
      setStatus(getPushStatus())
    }
  }

  return (
    <div className="bg-cloud rounded-[12px] divide-y divide-ink-100"
      style={{ border: '1px solid var(--ink-100)' }}>
      {/* In-app preference state. When this is off, init bails before
          even talking to iOS — surface that BEFORE the OS perm row so
          users don't chase a phantom "iOS blocked me" diagnosis. */}
      <div className="p-3.5 flex items-center gap-3">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: status.prefEnabled ? 'var(--avail)' : 'var(--coral)' }} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[13px] text-ink-900 leading-tight">App preference</div>
          <div className="font-display italic text-[11px] text-ink-500 mt-0.5">
            {status.prefEnabled
              ? 'notify.push is ON — init will run on next app launch.'
              : "notify.push is OFF — toggle it on above (or tap 'Reset & retry' below)."}
          </div>
        </div>
        <span className="text-[10.5px] font-bold tracking-wider uppercase px-2 py-1 rounded-full"
          style={{ background: 'var(--ink-100)', color: 'var(--ink-700)' }}>
          {status.prefEnabled ? 'On' : 'Off'}
        </span>
      </div>
      <div className="p-3.5 flex items-center gap-3">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: permColor }} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[13px] text-ink-900 leading-tight">iOS permission</div>
          <div className="font-display italic text-[11px] text-ink-500 mt-0.5">
            {perm === 'denied'
              ? 'Open iOS Settings → LingxiLoop → Notifications to re-enable.'
              : perm === 'granted'
                ? 'iOS will deliver alerts when the app is in background.'
                : perm === 'unknown'
                  ? 'iOS hasn\'t been asked yet — see the last-step row below.'
                  : 'iOS will show its dialog the next time init runs.'}
          </div>
        </div>
        <span className="text-[10.5px] font-bold tracking-wider uppercase px-2 py-1 rounded-full"
          style={{ background: 'var(--ink-100)', color: 'var(--ink-700)' }}>
          {permLabel}
        </span>
      </div>
      <div className="p-3.5 flex items-center gap-3">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: status.tokenSuffix ? 'var(--avail)' : 'var(--ink-300)' }} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[13px] text-ink-900 leading-tight">Device token</div>
          <div className="font-display italic text-[11px] text-ink-500 mt-0.5">
            {status.tokenSuffix
              ? `Registered with server (…${status.tokenSuffix}).`
              : 'No APNs token yet — see the last-step row below.'}
          </div>
        </div>
      </div>
      {/* The smoking gun for "why is push silently dead?". Shows the
          deepest step the most recent init() reached. */}
      <div className="p-3.5">
        <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-500 mb-1">Last init step</div>
        <div className="font-display italic text-[12px] text-ink-700 leading-snug">
          {stepLabel[status.lastStep]}
        </div>
      </div>
      {status.lastError && (
        <div className="p-3.5 text-[11.5px] font-display italic text-coral-deep leading-snug">
          Last error: {status.lastError}
        </div>
      )}
      <button
        type="button"
        onClick={() => void reregister(false)}
        disabled={busy}
        className="w-full text-left p-3.5 active:bg-paper transition text-[12.5px] font-semibold text-skype-deep disabled:opacity-50"
      >
        {busy ? 'Working…' : 'Re-register this device'}
        <span className="block font-display italic text-[11px] text-ink-500 mt-0.5 font-normal not-italic">
          Runs init again — respects the app preference toggle.
        </span>
      </button>
      <button
        type="button"
        onClick={() => void reregister(true)}
        disabled={busy}
        className="w-full text-left p-3.5 active:bg-paper transition text-[12.5px] font-semibold text-coral-deep disabled:opacity-50"
      >
        Reset &amp; retry (force)
        <span className="block font-display italic text-[11px] text-ink-500 mt-0.5 font-normal not-italic">
          Bypasses the in-app preference — useful if the toggle got stuck off.
        </span>
      </button>
    </div>
  )
}

/** "Delete account" button + two-step confirmation. Required by
 *  Apple App Store Guideline 5.1.1(v). The confirmation is in-line
 *  (no native confirm() dialog which iOS WKWebView styles poorly)
 *  so the destructive-action UX matches the rest of the app. */
function DeleteAccountButton() {
  const [stage, setStage] = useState<'idle' | 'confirm' | 'busy'>('idle')
  const [err, setErr] = useState<string | null>(null)

  if (stage === 'idle') {
    return (
      <button
        type="button"
        onClick={() => setStage('confirm')}
        className="w-full py-3 px-4 rounded-[12px] text-[13px] font-semibold text-coral-deep transition text-left active:opacity-70"
        style={{ border: '1px solid rgba(255, 122, 107, 0.3)' }}
      >
        删除账号
        <span className="block font-display italic text-[11px] text-ink-500 mt-0.5">永久删除此 LingxiLoop 账号</span>
      </button>
    )
  }

  return (
    <div
      className="rounded-[12px] p-3.5"
      style={{ border: '1px solid var(--coral)', background: 'rgba(255, 122, 107, 0.06)' }}
    >
      <div className="font-display text-[13px] text-ink-900 font-semibold mb-1">
        确定永久删除账号？
      </div>
      <div className="font-display italic text-[12px] text-ink-700 leading-snug mb-3">
        登录信息、第三方授权和个人资料将被删除。为保留其他成员的会话历史，
        你在共享对话中发布的消息仍会保留，但姓名将显示为“已注销用户”。此操作无法撤销。
      </div>
      {err && (
        <div className="text-[11.5px] text-coral-deep font-display italic mb-2 leading-snug">
          {err}
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={stage === 'busy'}
          onClick={() => { setStage('idle'); setErr(null) }}
          className="flex-1 h-9 rounded-[9px] text-[12.5px] font-semibold text-ink-700 bg-paper transition active:opacity-70 disabled:opacity-50"
          style={{ border: '1px solid var(--ink-100)' }}
        >取消</button>
        <button
          type="button"
          disabled={stage === 'busy'}
          onClick={async () => {
            setStage('busy')
            setErr(null)
            try {
              await api.deleteAccount()
              // Same race-safe pattern as Sign out: flip auth state
              // synchronously so AuthGate routes to the auth screen
              // this frame. The server already invalidated sessions
              // so any background calls will 401 cleanly.
              useAuth.getState().clear()
              try { await teardownPushNotifications() } catch { /* ignore */ }
            } catch (e) {
              setErr(e instanceof Error ? e.message : String(e))
              setStage('confirm')
            }
          }}
          className="flex-1 h-9 rounded-[9px] text-[12.5px] font-semibold text-white transition active:opacity-70 disabled:opacity-50"
          style={{ background: 'var(--coral)' }}
        >{stage === 'busy' ? '正在删除…' : '删除'}</button>
      </div>
    </div>
  )
}
