import { useEffect, useState } from 'react'
import { type ApiProject, type ApiQuotaSnapshot, type ApiQuotaWindow, api, getPairingServerOrigin, getServerOrigin } from '@/api/client'
import { Avatar } from '@/components/Avatar'
import { Checkbox } from '@/components/Checkbox'
import { isWindows } from '@/lib/runtime'
import { cn } from '@/lib/utils'
import { useApp } from '@/stores/app'
import { useAuth } from '@/stores/auth'
import { useComputers } from '@/stores/computers'
import { useDevtools } from '@/stores/devtools'
import { useParticipants } from '@/stores/participants'
import { usePrefs } from '@/stores/preferences'
import { useSoundStore } from '@/stores/sound'

const tabs = ['Profile', 'Usage', 'Computers', 'Projects', 'Memory', 'Trust & autonomy', 'Preferences'] as const
type Tab = (typeof tabs)[number]

const PREF_GROUPS: Array<{ title: string; items: Array<{ key: string; lbl: string; sub: string; default: boolean }> }> = [
  {
    title: '通知',
    items: [
      { key: 'notify.group_pulled', lbl: 'Agent 邀请你加入群聊时', sub: '始终 · 从不 · 仅紧急情况', default: true },
      { key: 'notify.whisper_mention', lbl: '私聊中提及你时', sub: '始终 · 摘要 · 从不', default: true },
      { key: 'notify.convene_called', lbl: '有人发起协作会话时', sub: '始终 · 从不', default: true },
      { key: 'notify.daily_summary', lbl: 'Agent 夜间活动每日摘要', sub: '当地时间上午 8:00', default: false },
    ],
  },
  {
    title: '外观与体验',
    items: [
      { key: 'ui.reduce_motion', lbl: '减少动态效果', sub: '减少界面动画', default: false },
      { key: 'ui.typing_indicators', lbl: '显示输入状态', sub: '查看 Agent 是否正在组织回复', default: true },
      { key: 'ui.thoughts_in_main', lbl: '在主聊天中显示思考片段', sub: '通常仅在私聊中显示', default: false },
    ],
  },
  {
    title: '隐私',
    items: [
      { key: 'priv.allow_silent_whispers', lbl: '允许 Agent 自主私聊', sub: '对话仍会记录在你的会话中', default: true },
      { key: 'priv.allow_new_tools', lbl: '允许 Agent 自主调用新工具', sub: '仅限你已授予的权限', default: true },
      { key: 'priv.allow_human_invites', lbl: '允许 Agent 邀请成员加入群聊', sub: '每次都需要你的同意', default: false },
    ],
  },
]

function ProfileTab() {
  // Pull both the auth user (real account: id, email, providers) and the
  // matching participant (for avatar). They're usually the same person but
  // participant rows can lag in the local cache, so we don't gate on it.
  const authUser = useAuth((s) => s.user)
  const meParticipant = useParticipants((s) => (authUser ? s.byId[authUser.id] : null))
  const serverOrigin = getServerOrigin() || 'same-origin (Vite proxy)'

  async function signOut() {
    // Server-side: revoke the session row so the token is dead even if it
    // leaks. Best-effort — client clear still happens on network failure.
    try { await api.authLogout() } catch (e) { console.warn('[signout] server call failed', e) }
    useAuth.getState().clear()
    location.reload()
  }

  if (!authUser) return null
  const providers = authUser.providers ?? []
  return (
    <div className="space-y-6">
      <Section title="↳ 身份信息">
        <div className="bg-cloud rounded-[14px] p-5 flex items-start gap-5"
          style={{ border: '1px solid var(--ink-100)' }}>
          {meParticipant
            ? <Avatar p={meParticipant} size={88} />
            : <div className="w-[88px] h-[88px] rounded-full bg-ink-100" />}
          <div className="flex-1 min-w-0">
            <h2 className="font-display font-medium text-[26px] tracking-tight truncate" style={{ letterSpacing: '-0.02em' }}>{authUser.name}</h2>
            <div className="font-display italic text-[14px] text-ink-500 truncate">{authUser.email}</div>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {providers.map((p) => (
                <span key={p} className="text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-white text-ink-600" style={{ border: '1px solid var(--ink-100)' }}>
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section title="↳ 登录会话">
        <div className="bg-cloud rounded-[14px] p-5 flex items-center justify-between gap-4"
          style={{ border: '1px solid var(--ink-100)' }}>
          <div className="min-w-0">
            <div className="font-display text-[14px] text-ink-800">当前登录到 <span className="font-mono text-[12px]">{serverOrigin}</span></div>
            <div className="font-display italic text-[12px] text-ink-400 mt-0.5">
              退出登录会清除本地凭据，并在服务器端撤销当前会话。
            </div>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="shrink-0 h-9 px-4 rounded-[8px] bg-ink-800 hover:bg-ink-900 text-white text-[13px] font-display transition-colors"
          >
            退出登录
          </button>
        </div>
      </Section>

      <AboutSection />
    </div>
  )
}

/** LingxiLoop version + auto-update entry point. Renders only when the
 *  Electron bridge is available (PWA / web builds have no updater).
 *  Click "Check for updates" → opens the UpdaterDialog mounted at the
 *  AuthedApp level via a custom window event (avoids prop-drilling
 *  through three layers of view components). */
function AboutSection() {
  const [version, setVersion] = useState<string | null>(null)
  const [supported, setSupported] = useState<boolean>(false)

  useEffect(() => {
    const bridge = typeof window !== 'undefined' ? window.lingxiloop?.update : undefined
    if (!bridge) return
    void bridge.getAppInfo().then((info) => {
      setVersion(info.version)
      setSupported(info.autoUpdateSupported)
    }).catch(() => { /* swallow — section just hides */ })
  }, [])

  if (!version) return null

  return (
    <Section title="↳ 关于">
      <div className="bg-cloud rounded-[14px] p-5 flex items-center justify-between gap-4"
        style={{ border: '1px solid var(--ink-100)' }}>
        <div className="min-w-0">
          <div className="font-display text-[14px] text-ink-800">LingxiLoop <span className="font-mono text-[12px]">v{version}</span></div>
          <div className="font-display italic text-[12px] text-ink-400 mt-0.5">
            {supported
              ? '每天自动检查更新，新版本可用时会显示提示。'
              : '此版本不支持自动更新，可打开更新窗口查看详情。'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('lingxiloop:open-updater'))}
          className="shrink-0 h-9 px-4 rounded-[8px] text-[13px] font-display transition-colors text-white"
          style={{ background: 'var(--skype)' }}
        >
          检查更新
        </button>
      </div>
    </Section>
  )
}

/* ============================ Usage / Quota ============================
 * Three rounded "weather cards" — daily / weekly / monthly — mirroring
 * the lingxiloop cloud-and-paper feel. The bars use --skype on a faint
 * sky2-100 track until usage crosses 75% (turns coral) and 95% (deep
 * coral with a quiet pulse). Numbers come from sub2api's subscription
 * summary; everything is best-effort — missing data renders a soft
 * "unavailable" card rather than a hard error. */

type PeriodKey = 'daily' | 'weekly' | 'monthly'

const PERIOD_META: Array<{ key: PeriodKey; label: string; sub: string }> = [
  { key: 'daily',   label: '每日',   sub: '当地时间零点重置' },
  { key: 'weekly',  label: '每周',   sub: '每周重置' },
  { key: 'monthly', label: '每月', sub: '每月重置' },
]

function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (n === 0) return '$0.00'
  if (n < 0.01) return '<$0.01'
  if (n < 10) return `$${n.toFixed(2)}`
  if (n < 1000) return `$${n.toFixed(2)}`
  return `$${Math.round(n).toLocaleString()}`
}

/** Best-effort "resets in 3h" / "resets in 2d" string. Falls back to a
 *  blank string when sub2api didn't hand back a window start (older
 *  rows). The period length is fixed (24h / 7d / ~30d) — sub2api uses
 *  rolling windows, so we count forward from window_start. */
function resetsHint(period: PeriodKey, windowStart: string | null): string {
  if (!windowStart) return ''
  const start = new Date(windowStart).getTime()
  if (Number.isNaN(start)) return ''
  const lenMs = period === 'daily' ? 86_400_000
              : period === 'weekly' ? 7 * 86_400_000
              : 30 * 86_400_000
  const remaining = start + lenMs - Date.now()
  if (remaining <= 0) return 'resets soon'
  const h = Math.floor(remaining / 3_600_000)
  if (h < 1) {
    const m = Math.max(1, Math.floor(remaining / 60_000))
    return `resets in ${m}m`
  }
  if (h < 48) return `resets in ${h}h`
  const d = Math.floor(h / 24)
  return `resets in ${d}d`
}

function QuotaCard({ period, label, sub, window }: {
  period: PeriodKey
  label: string
  sub: string
  window: ApiQuotaWindow | null
}) {
  const used = window?.usedUsd ?? 0
  const limit = window?.limitUsd ?? null
  const pct = limit != null && limit > 0 ? Math.min(100, (used / limit) * 100) : 0
  // Tone shifts as the user gets close to the cap. Default is the brand
  // skype blue; coral takes over past the 75% mark so a glance at the
  // cards still tells the user "you're fine" vs "slow down".
  const tone = limit == null ? 'neutral'
             : pct >= 95 ? 'danger'
             : pct >= 75 ? 'warn'
             : 'ok'
  const barColor = tone === 'danger' ? 'var(--coral-deep, #C84E3F)'
                 : tone === 'warn'   ? 'var(--coral, #FF7A6B)'
                 : tone === 'ok'     ? 'var(--skype, #00A8F0)'
                 : 'var(--ink-300, #94A8BC)'
  const resets = window ? resetsHint(period, window.windowStart) : ''
  return (
    <div className="bg-cloud rounded-[14px] p-5 flex flex-col gap-3"
      style={{ border: '1px solid var(--ink-100)' }}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-display font-semibold text-[14px] text-ink-900">{label}</div>
        {limit != null
          ? <div className="font-mono text-[11px] font-semibold text-ink-500">{pct.toFixed(0)}%</div>
          : <div className="font-mono text-[10px] tracking-wider uppercase text-ink-300">unlimited</div>}
      </div>
      <div className="font-display tabular-nums text-[22px] tracking-tight text-ink-900" style={{ letterSpacing: '-0.02em' }}>
        {fmtUsd(used)}
        <span className="text-ink-300 text-[15px] font-normal"> / {limit != null ? fmtUsd(limit) : '∞'}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--sky2-100, #E1F3FD)' }}>
        <div
          className="h-full rounded-full transition-[width,background-color,opacity] duration-500"
          style={{
            width: limit != null ? `${Math.max(2, pct)}%` : '100%',
            background: barColor,
            opacity: limit != null ? 1 : 0.35,
          }}
        />
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-display italic text-ink-400">{sub}</span>
        {resets && <span className="font-mono text-ink-500">{resets}</span>}
      </div>
    </div>
  )
}

function UsageTab() {
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'ready'; configured: boolean; snapshot: ApiQuotaSnapshot | null; error?: string }
    | { kind: 'error'; message: string }
  >({ kind: 'loading' })

  const load = () => {
    setState({ kind: 'loading' })
    api.getQuota()
      .then((r) => setState({ kind: 'ready', configured: r.configured, snapshot: r.snapshot, error: r.error }))
      .catch((e) => setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) }))
  }
  useEffect(load, [])

  if (state.kind === 'loading') {
    return (
      <div className="space-y-6">
        <Section title="↳ 用量额度">
          <div className="grid grid-cols-3 gap-3">
            {PERIOD_META.map((p) => (
              <div key={p.key} className="bg-cloud rounded-[14px] p-5 h-[140px]"
                style={{ border: '1px solid var(--ink-100)' }}>
                <div className="font-display font-semibold text-[14px] text-ink-300">{p.label}</div>
                <div className="font-display italic text-[12px] text-ink-300 mt-2">加载中…</div>
              </div>
            ))}
          </div>
        </Section>
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="space-y-6">
        <Section title="↳ Quota">
          <div className="bg-cloud rounded-[14px] p-6 text-center"
            style={{ border: '1px solid var(--ink-100)' }}>
            <div className="font-display text-[14px] text-ink-700 mb-1">无法获取用量额度</div>
            <div className="font-display italic text-[12px] text-coral-deep mb-3">{state.message}</div>
            <button onClick={load}
              className="px-4 py-1.5 rounded-[8px] text-[12px] font-semibold text-white"
              style={{ background: 'var(--skype)' }}>
              重试
            </button>
          </div>
        </Section>
      </div>
    )
  }

  // ready
  const { configured, snapshot, error } = state
  if (!configured) {
    return (
      <div className="space-y-6">
        <Section title="↳ Quota">
          <div className="bg-cloud rounded-[14px] p-6"
            style={{ border: '1px dashed var(--ink-100)' }}>
            <div className="font-display text-[14px] text-ink-700">No quota gateway on this deployment</div>
            <div className="font-display italic text-[12px] text-ink-500 mt-1 max-w-xl">
              This server isn't running a sub2api gateway, so per-period quotas aren't tracked. Usage is governed by the host's own API key allowance.
            </div>
          </div>
        </Section>
      </div>
    )
  }

  if (!snapshot) {
    return (
      <div className="space-y-6">
        <Section title="↳ Quota">
          <div className="bg-cloud rounded-[14px] p-6"
            style={{ border: '1px dashed var(--ink-100)' }}>
            <div className="font-display text-[14px] text-ink-700">
              {error ? 'Quota gateway is unreachable' : 'No active subscription'}
            </div>
            <div className="font-display italic text-[12px] text-ink-500 mt-1 max-w-xl">
              {error
                ? 'The lingxiloop server couldn\'t reach the quota gateway. Try again in a moment.'
                : 'Your account hasn\'t been provisioned on the quota gateway yet. This usually clears up on its own — try again in a minute.'}
            </div>
            <button onClick={load}
              className="mt-3 px-4 py-1.5 rounded-[8px] text-[12px] font-semibold text-skype-deep bg-cloud hover:bg-sky2-50 transition"
              style={{ border: '1px dashed var(--sky2-300)' }}>
              Refresh
            </button>
          </div>
        </Section>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Section title="↳ Quota">
        <div className="text-[13px] text-ink-500 leading-[1.55] mb-4 max-w-2xl font-display italic">
          What your agents have spent on this account, across the rolling windows the gateway enforces. Numbers are in USD.
          {snapshot.groupName ? <> Plan: <span className="not-italic font-semibold text-skype-deep">{snapshot.groupName}</span>.</> : null}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {PERIOD_META.map((p) => (
            <QuotaCard
              key={p.key}
              period={p.key}
              label={p.label}
              sub={p.sub}
              window={snapshot[p.key]}
            />
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button onClick={load}
            className="px-4 py-1.5 rounded-[8px] text-[12px] font-semibold text-skype-deep bg-cloud hover:bg-sky2-50 transition"
            style={{ border: '1px solid var(--ink-100)' }}>
            Refresh
          </button>
          {error && <span className="text-[11.5px] text-coral-deep font-display italic">last refresh had a hiccup: {error}</span>}
        </div>
      </Section>
    </div>
  )
}

function TrustTab() {
  const byId = useParticipants((s) => s.byId)
  const autonomy = usePrefs((s) => s.autonomy)
  const setAutonomy = usePrefs((s) => s.setAutonomy)
  const agents = Object.values(byId).filter((p) => p.kind === 'agent')
  const [rules, setRules] = useState<Awaited<ReturnType<typeof api.getAutonomyRules>>>([])
  const [rulesError, setRulesError] = useState<string | null>(null)
  const loadRules = () => void api.getAutonomyRules().then(setRules).catch((error) => {
    setRulesError(error instanceof Error ? error.message : String(error))
  })
  useEffect(loadRules, [])

  return (
    <div className="space-y-6">
      <Section title="↳ Agent 自主权">
        <div className="text-[13px] text-ink-500 leading-[1.55] mb-4 max-w-2xl font-display italic">
          每个 Agent 都有独立的自主行动阈值，包括发起群聊、调用工具和联系其他 Agent。你可以根据其表现分别调整。
        </div>
        <div className="space-y-2">
          {agents.map((a) => {
            const trust = autonomy[a.id]?.threshold ?? 0.6
            return (
              <div key={a.id} className="bg-cloud rounded-[12px] p-4 grid grid-cols-[184px_minmax(0,1fr)] items-center gap-5"
                style={{ border: '1px solid var(--ink-100)' }}>
                <div className="flex items-center gap-4 min-w-0">
                  <Avatar p={a} size={36} showStatus={false} />
                  <div className="min-w-0">
                    <div className="font-bold text-[13.5px] text-ink-900 truncate">{a.name}</div>
                    <div className="font-display italic text-[11.5px] text-ink-500 truncate">{a.role}</div>
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] text-ink-500 mb-1.5 flex justify-between">
                    <span>自主行动阈值</span>
                    <span className="font-mono text-[11px] font-semibold text-ink-700">{trust.toFixed(2)}</span>
                  </div>
                  <input type="range" min={0} max={1} step={0.01} value={trust}
                    onChange={(e) => setAutonomy(a.id, parseFloat(e.target.value))}
                    className="w-full accent-whisper" />
                </div>
              </div>
            )
          })}
        </div>
      </Section>

      <Section title="↳ 明确的允许 / 询问 / 拒绝规则">
        <div className="mb-3 text-[12px] text-ink-500">
          当你明确告诉 Agent“以后不用问”或“每次都要问”时，规则会出现在这里。外发、删除和付款等硬风险动作仍然需要审批。
        </div>
        {rulesError && <div className="mb-3 text-[11px] text-coral-deep">{rulesError}</div>}
        <div className="space-y-2">
          {rules.map((rule) => (
            <div key={rule.id} className="flex items-center justify-between gap-3 rounded-[12px] border border-ink-100 bg-cloud px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-ink-800">
                  {byId[rule.agentId]?.name ?? rule.agentId} · {rule.scope}.{rule.operation}
                </div>
                <div className="mt-0.5 text-[10.5px] uppercase tracking-wide text-ink-400">
                  {rule.mode === 'allow' ? '允许' : rule.mode === 'ask' ? '每次询问' : '拒绝'} · {rule.source === 'explicit_user' ? '用户明确设置' : '已学习'}
                </div>
              </div>
              <button type="button" onClick={() => void api.deleteAutonomyRule(rule.id).then(loadRules)} className="shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-coral-deep hover:bg-coral-soft/30">
                撤销
              </button>
            </div>
          ))}
          {rules.length === 0 && <div className="rounded-xl border border-dashed border-ink-100 px-6 py-7 text-center text-[12px] text-ink-400">还没有明确的自治规则。</div>}
        </div>
      </Section>

      <Section title="↳ 群聊协作记录">
        <div className="grid grid-cols-3 gap-3">
          {agents.slice(0, 3).map((a) => {
            const ar = autonomy[a.id]
            return (
              <div key={a.id} className="bg-cloud rounded-[12px] p-4"
                style={{ border: '1px solid var(--ink-100)' }}>
                <div className="flex items-center gap-2.5 mb-3">
                  <Avatar p={a} size={28} showStatus={false} />
                  <div className="font-bold text-[13px] text-ink-900">{a.name}</div>
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-center">
                  <Stat n={ar?.pulled ?? 0} l="发起" tone="good" />
                  <Stat n={ar?.led ?? 0} l="主持" tone="good" />
                  <Stat n={ar?.dissolved ?? 0} l="无效" tone="warn" />
                </div>
              </div>
            )
          })}
        </div>
      </Section>
    </div>
  )
}

function Stat({ n, l, tone }: { n: number; l: string; tone: 'good' | 'warn' }) {
  return (
    <div>
      <div className="font-display text-[20px] font-medium" style={{ color: tone === 'good' ? 'var(--avail)' : 'var(--coral-deep)' }}>{n}</div>
      <div className="text-[9px] font-bold text-ink-300 uppercase tracking-wider">{l}</div>
    </div>
  )
}

function ProjectsTab() {
  const [projects, setProjects] = useState<ApiProject[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const refresh = () => {
    void api.listProjects().then(setProjects).catch(() => { /* ignore */ })
  }
  useEffect(refresh, [])

  const create = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy(true); setErr(null)
    try {
      await api.createProject({ name: trimmed, description: description.trim() })
      setName(''); setDescription(''); setCreating(false); refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const archive = async (id: string, archive: boolean) => {
    try { await api.archiveProject(id, archive); refresh() }
    catch (e) { console.warn('[projects] archive failed', e) }
  }

  const visible = showArchived ? projects : projects.filter((p) => p.status === 'active')
  const archivedCount = projects.filter((p) => p.status === 'archived').length

  return (
    <div className="space-y-6">
      <Section title="↳ 项目">
        <div className="text-[13px] text-ink-500 leading-[1.55] mb-4 max-w-2xl font-display italic">
          项目可将相关群聊归入统一名称与颜色标识，帮助成员和 Agent 清楚理解每段对话的工作范围。
        </div>

        <div className="space-y-2">
          {visible.length === 0 && !creating && (
            <div className="bg-cloud rounded-[12px] p-6 text-center text-[13px] text-ink-500 italic font-display"
              style={{ border: '1px dashed var(--ink-100)' }}>
              暂无项目。点击 <b className="not-italic text-skype-deep">+ 新建项目</b> 开始创建。
            </div>
          )}
          {visible.map((p) => (
            <div key={p.id} className="bg-cloud rounded-[12px] p-4 flex items-center gap-4"
              style={{ border: '1px solid var(--ink-100)', opacity: p.status === 'archived' ? 0.55 : 1 }}>
              <div className="w-3 h-10 rounded-full shrink-0" style={{ background: p.color ?? 'var(--ink-200)' }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="font-semibold text-[14px] text-ink-900 truncate">{p.name}</div>
                  {p.status === 'archived' && <span className="text-[10px] text-ink-300 uppercase tracking-wider">已归档</span>}
                </div>
                <div className="font-display italic text-[12px] text-ink-500 truncate">
                  {p.description || '暂无描述'}  ·  {p.conversationCount} 个对话
                </div>
              </div>
              <button
                onClick={() => archive(p.id, p.status !== 'archived')}
                className="px-3 py-1.5 rounded-[8px] text-[11.5px] font-semibold text-ink-700 bg-paper hover:bg-sky2-50 transition"
                style={{ border: '1px solid var(--ink-100)' }}
              >{p.status === 'archived' ? '恢复' : '归档'}</button>
            </div>
          ))}
        </div>

        {creating ? (
          <div className="mt-4 bg-cloud rounded-[12px] p-4 space-y-2"
            style={{ border: '1.5px solid var(--sky2-300)' }}>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="项目名称"
              className="w-full px-3 py-2 text-[13px] rounded outline-none"
              style={{ border: '1px solid var(--ink-100)', background: 'var(--paper)' }}
            />
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简短描述（可选）"
              className="w-full px-3 py-2 text-[12.5px] rounded outline-none"
              style={{ border: '1px solid var(--ink-100)', background: 'var(--paper)' }}
            />
            {err && <div className="text-[11.5px] text-coral-deep">{err}</div>}
            <div className="flex gap-2">
              <button
                onClick={create}
                disabled={!name.trim() || busy}
                className="px-4 py-1.5 rounded-[8px] text-[12px] font-semibold text-white disabled:opacity-50"
                style={{ background: 'var(--skype)' }}
              >{busy ? '…' : '创建项目'}</button>
              <button
                onClick={() => { setCreating(false); setName(''); setDescription(''); setErr(null) }}
                className="px-3 py-1.5 rounded-[8px] text-[12px] text-ink-500 hover:bg-cloud"
              >取消</button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={() => setCreating(true)}
              className="px-4 py-2 rounded-[10px] text-[12.5px] font-semibold text-skype-deep bg-cloud hover:bg-sky2-50 transition"
              style={{ border: '1px dashed var(--sky2-300)' }}
            >+ 新建项目</button>
            {archivedCount > 0 && (
              <button
                onClick={() => setShowArchived((v) => !v)}
                className="text-[11.5px] text-ink-500 hover:text-skype-deep transition italic font-display"
              >
                {showArchived ? '隐藏已归档项目' : `显示已归档项目（${archivedCount}）`}
              </button>
            )}
          </div>
        )}
      </Section>
    </div>
  )
}

function PreferencesTab() {
  const prefs = usePrefs((s) => s.prefs)
  const setPref = usePrefs((s) => s.setPref)
  const devtoolsEnabled = useDevtools((s) => s.enabled)
  const devtoolsCanEnable = useDevtools((s) => s.canEnable)
  const devtoolsLocal = useDevtools((s) => s.localDev)
  const setDevMode = useDevtools((s) => s.setDevMode)
  const loadDevtools = useDevtools((s) => s.load)
  const get = (k: string, fallback: boolean) => (prefs[k] === undefined ? fallback : Boolean(prefs[k]))

  useEffect(() => {
    void loadDevtools()
  }, [loadDevtools])

  return (
    <div className="space-y-6">
      {PREF_GROUPS.map((g) => (
        <Section key={g.title} title={`↳ ${g.title}`}>
          <div className="bg-cloud rounded-[14px] divide-y divide-ink-100"
            style={{ border: '1px solid var(--ink-100)' }}>
            {g.items.map((it, i) => {
              const on = get(it.key, it.default)
              return (
                <div key={i} className="flex items-center gap-4 p-4 cursor-pointer" onClick={() => setPref(it.key, !on)}>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[13px] text-ink-900">{it.lbl}</div>
                    <div className="font-display italic font-normal text-[11.5px] text-ink-500 mt-0.5">{it.sub}</div>
                  </div>
                  <span className={cn('w-9 h-5 rounded-full relative shrink-0 transition-colors', on ? 'bg-skype' : 'bg-ink-200')}>
                    <span className={cn('absolute w-4 h-4 bg-white rounded-full top-0.5 transition-all', on ? 'left-[18px]' : 'left-0.5')}
                      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </span>
                </div>
              )
            })}
          </div>
        </Section>
      ))}
      <SkypeSoundSection />
      {devtoolsCanEnable && (
        <Section title="↳ 开发者">
          <Checkbox
            checked={devtoolsEnabled}
            disabled={devtoolsLocal}
            onCheckedChange={(next) => { void setDevMode(next) }}
            label="开发者模式"
            description={devtoolsLocal
              ? '本地开发版本中始终启用'
              : '显示观测页面并解锁此设备上的开发工具'}
          />
        </Section>
      )}
    </div>
  )
}

function SkypeSoundSection() {
  // Local-only toggle — see stores/sound.ts for why this isn't synced
  // through the server preferences store. Default is muted; users opt
  // in if they want the classic (clap) / (drum) chimes.
  const muted = useSoundStore((s) => s.muted)
  const setMuted = useSoundStore((s) => s.setMuted)
  const on = !muted
  return (
    <Section title="↳ LingxiLoop 动态表情">
      <div className="bg-cloud rounded-[14px]"
        style={{ border: '1px solid var(--ink-100)' }}>
        <div className="flex items-center gap-4 p-4 cursor-pointer" onClick={() => setMuted(on)}>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[13px] text-ink-900">播放动态表情音效</div>
            <div className="font-display italic font-normal text-[11.5px] text-ink-500 mt-0.5">
              仅应用于此设备 · 动态表情进入视野时播放一次，点击表情可重播
            </div>
          </div>
          <span className={cn('w-9 h-5 rounded-full relative shrink-0 transition-colors', on ? 'bg-skype' : 'bg-ink-200')}>
            <span className={cn('absolute w-4 h-4 bg-white rounded-full top-0.5 transition-all', on ? 'left-[18px]' : 'left-0.5')}
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
          </span>
        </div>
      </div>
    </Section>
  )
}

const ENGINE_LABEL: Record<string, string> = { managed: 'LingxiLoop', claude: 'Claude Code', codex: 'Codex' }
const KIND_ICON: Record<string, string> = { cloud: '☁', local: '💻', vps: '🖥' }
const STATUS_COLOR: Record<string, string> = { online: '#3BB273', busy: '#E6A23C', offline: 'var(--ink-300)' }

function ComputersTab() {
  const byId = useComputers((s) => s.byId)
  const loaded = useComputers((s) => s.loaded)
  const participants = useParticipants((s) => s.byId)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // Engine for a NEWLY added computer's starter/assigned agents. Claude is the
  // default (no flag → daemon auto-detects); Codex appends `--engine codex`.
  const [engine, setEngine] = useState<'claude' | 'codex'>('claude')
  // Default on: install the always-on service (auto-start/restart/update).
  // --install-service is macOS/Linux only (daemon throws on Windows) → off + hidden there.
  const [asService, setAsService] = useState(!isWindows)
  // Per-computer re-pair (reconnect) command, keyed by computer id.
  const [repairFor, setRepairFor] = useState<string | null>(null)
  const [repairCode, setRepairCode] = useState<string | null>(null)
  const [repairCopied, setRepairCopied] = useState(false)

  useEffect(() => { void useComputers.getState().refresh() }, [])
  useEffect(() => { if (!repairCopied) return; const t = window.setTimeout(() => setRepairCopied(false), 1600); return () => window.clearTimeout(t) }, [repairCopied])

  async function toggleRepair(id: string) {
    if (repairFor === id) { setRepairFor(null); setRepairCode(null); return }
    setRepairFor(id); setRepairCode(null)
    try { setRepairCode((await api.repairComputer(id)).code) }
    catch (e) { alert(e instanceof Error ? e.message : String(e)); setRepairFor(null) }
  }
  useEffect(() => { if (!copied) return; const t = window.setTimeout(() => setCopied(false), 1600); return () => window.clearTimeout(t) }, [copied])

  function copyCommand() {
    void navigator.clipboard?.writeText(pairCommand)
    setCopied(true)
  }

  const origin = getPairingServerOrigin()
  const serverFlag = origin ? ` --server ${origin}` : ''
  const pairCommand = code ? `npx lingxiloop@latest agent computer --pair ${code}${serverFlag}${engine === 'codex' ? ' --engine codex' : ''}${asService ? ' --install-service' : ''}` : ''
  const list = Object.values(byId).sort((a, b) =>
    (a.kind === 'cloud' ? 0 : 1) - (b.kind === 'cloud' ? 0 : 1) || a.name.localeCompare(b.name))

  function agentCount(computerId: string, isCloud: boolean): number {
    return Object.values(participants).filter((p) =>
      p.kind === 'agent' && !p.departedAt &&
      (p.computerId === computerId || (isCloud && !p.computerId))).length
  }

  // Clicking "Add a computer" just mints a pairing token and shows the command.
  // The computer itself is created server-side only when the daemon pairs and
  // reports the machine's real hostname — so no placeholder row, and it shows
  // up here (named after the machine) once paired, via the WS status event.
  async function addComputer() {
    setErr(null); setBusy(true)
    try {
      const res = await api.requestPairingCode()
      setCode(res.code)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  async function remove(id: string, label: string) {
    if (!confirm(`Remove "${label}"? Its agents will go offline until you re-pair.`)) return
    try {
      await api.deleteComputer(id)
      await useComputers.getState().refresh()
    } catch (e) { alert(e instanceof Error ? e.message : String(e)) }
  }

  return (
    <div className="space-y-6">
      <Section title="↳ Where your agents run">
        <p className="text-[13px] text-ink-500 mb-4 max-w-[640px]">
          Every agent runs on a <strong>Computer</strong>. <em>LingxiLoop Cloud</em> is built in and
          always on. Pair your own machine or a VPS to run agents on your local
          <span className="font-mono text-[12px]"> Claude Code</span> or
          <span className="font-mono text-[12px]"> Codex</span> — each agent gets its own isolated
          workspace, memory and skills there.
        </p>

        {!loaded && <div className="text-[13px] text-ink-400">Loading…</div>}

        <div className="grid gap-3">
          {list.map((c) => {
            const n = agentCount(c.id, c.kind === 'cloud')
            const repairable = c.kind !== 'cloud'
            const expanded = repairFor === c.id
            const repairCmd = repairCode ? `npx lingxiloop@latest agent computer --pair ${repairCode}${serverFlag}` : ''
            return (
              <div key={c.id} className="bg-cloud rounded-[14px]" style={{ border: '1px solid var(--ink-100)' }}>
                <div
                  className={cn('p-4 flex items-center gap-4 rounded-[14px]', repairable && 'cursor-pointer hover:bg-sky-50/50')}
                  onClick={repairable ? () => void toggleRepair(c.id) : undefined}>
                  <div className="text-[22px] w-8 text-center">{KIND_ICON[c.kind] ?? '🖥'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-display font-medium text-[16px] text-ink-900">{c.name}</span>
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-500">
                        <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR[c.status] ?? 'var(--ink-300)' }} />
                        {c.status}
                      </span>
                      {c.daemonOutdated && (
                        <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: 'rgba(244,183,64,0.18)', color: 'var(--gold-deep)' }}
                          title={c.latestDaemonVersion ? `Update to v${c.latestDaemonVersion}` : 'Update available'}>
                          ↑ update{c.daemonVersion ? ` · v${c.daemonVersion}` : ''}
                        </span>
                      )}
                    </div>
                    <div className="text-[12px] text-ink-500 mt-0.5">
                      {c.availableEngines.map((e) => ENGINE_LABEL[e] ?? e).join(', ') || '—'}
                      {' · '}{n} agent{n === 1 ? '' : 's'}
                      {repairable && c.daemonVersion && (
                        <>{' · '}<span className="font-mono text-[11px] text-ink-400">v{c.daemonVersion}</span></>
                      )}
                    </div>
                  </div>
                  {repairable && (
                    <>
                      <span className="text-[12px] font-semibold text-skype-deep">{expanded ? 'Hide' : 'Reconnect'}</span>
                      <button onClick={(e) => { e.stopPropagation(); void remove(c.id, c.name) }}
                        className="text-[12px] font-semibold text-coral-deep hover:underline px-2 py-1">
                        Remove
                      </button>
                    </>
                  )}
                </div>
                {expanded && (
                  <div className="px-4 pb-4 pt-3 border-t border-ink-100">
                    <div className="text-[12px] text-ink-500 mb-2 italic font-display">
                      Run this on “{c.name}” to reconnect it — its agents stay attached. This token stays valid.
                    </div>
                    {!repairCode ? (
                      <div className="text-[12px] text-ink-400">Generating…</div>
                    ) : (
                      <>
                        <pre className="bg-ink-900 text-cloud rounded-[10px] p-3 text-[12px] overflow-x-auto whitespace-pre-wrap break-all font-mono select-all">{repairCmd}</pre>
                        <button onClick={(e) => { e.stopPropagation(); void navigator.clipboard?.writeText(repairCmd); setRepairCopied(true) }}
                          className="mt-2 inline-flex items-center justify-center min-w-[120px] text-[12px] font-semibold px-3 py-1.5 rounded-[9px] text-white transition-colors duration-200"
                          style={{ background: repairCopied ? '#3BB273' : 'var(--skype)' }}>
                          {repairCopied ? '✓ Copied!' : 'Copy command'}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {code ? (
          <div className="mt-4 bg-sky-50 rounded-[14px] p-4" style={{ border: '1px solid var(--sky-100)' }}>
            <div className="text-[13px] font-semibold text-ink-900 mb-1">
              Run this on the machine you want to host agents:
            </div>
            <div className="text-[11.5px] text-ink-500 mb-2.5 italic font-display">
              Needs <span className="font-mono not-italic">claude</span> or <span className="font-mono not-italic">codex</span> installed. The computer names itself after that machine and appears here once paired. This token stays valid.
            </div>
            <div className="flex items-center gap-2.5 mb-2.5">
              <span className="text-[12px] text-ink-500">Engine</span>
              <div className="inline-flex rounded-[9px] p-0.5" style={{ background: 'var(--ink-100)' }}>
                {([['claude', 'Claude Code'], ['codex', 'Codex']] as const).map(([id, label]) => (
                  <button key={id} type="button" onClick={() => setEngine(id)}
                    className="px-3 py-1 rounded-[7px] text-[12px] font-semibold transition-colors duration-150"
                    style={engine === id
                      ? { background: 'var(--paper)', color: 'var(--ink-900)', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }
                      : { color: 'var(--ink-500)' }}>
                    {label}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-ink-400">just the default — this computer can still run agents on either engine</span>
            </div>
            {isWindows ? (
              <div className="mb-2.5 text-[12px] text-ink-600">
                Keep this terminal open while the agents run.
                <span className="text-ink-400"> — background service install isn’t supported on Windows yet.</span>
              </div>
            ) : (
              <label className="flex items-start gap-2 mb-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={asService} onChange={(e) => setAsService(e.target.checked)} className="mt-[3px]" />
                <span className="text-[12px] text-ink-600">
                  Keep it running in the background <span className="text-ink-400">— auto-start on boot, auto-restart on crash, auto-update. Otherwise this terminal has to stay open.</span>
                </span>
              </label>
            )}
            <pre className="bg-ink-900 text-cloud rounded-[10px] p-3 text-[12px] overflow-x-auto whitespace-pre-wrap break-all font-mono select-all">{pairCommand}</pre>
            <div className="flex gap-2 mt-3">
              <button onClick={copyCommand} aria-live="polite"
                className="inline-flex items-center justify-center gap-1.5 min-w-[128px] text-[12px] font-semibold px-3 py-1.5 rounded-[9px] text-white transition-colors duration-200"
                style={{ background: copied ? '#3BB273' : 'var(--skype)' }}>
                {copied ? (
                  <>
                    <svg key="ck" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                      style={{ animation: 'cp-pop 0.32s cubic-bezier(.36,1.6,.4,1)' }}>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span style={{ animation: 'cp-fade 0.2s ease' }}>Copied!</span>
                  </>
                ) : 'Copy command'}
              </button>
              <button onClick={() => setCode(null)}
                className="text-[12px] font-semibold px-3 py-1.5 rounded-[9px] border border-ink-100 text-ink-600">Done</button>
            </div>
            <style>{`
              @keyframes cp-pop { 0% { transform: scale(0.2); opacity: 0 } 55% { transform: scale(1.3) } 100% { transform: scale(1); opacity: 1 } }
              @keyframes cp-fade { from { opacity: 0; transform: translateX(-2px) } to { opacity: 1; transform: none } }
            `}</style>
          </div>
        ) : (
          <>
            {err && <div className="mt-4 text-[12px] text-coral-deep bg-coral-soft rounded-[8px] p-2">{err}</div>}
            <button onClick={addComputer} disabled={busy}
              className="mt-4 px-4 py-2 rounded-[10px] bg-skype text-white text-[13px] font-semibold disabled:opacity-50">
              {busy ? 'Generating…' : '+ Add a computer'}
            </button>
          </>
        )}
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[10.5px] font-extrabold text-skype tracking-[0.14em] uppercase mb-3">{title}</h4>
      {children}
    </div>
  )
}

/** Elegant, self-clearing "your daemon is behind" banner. Shows the moment any
 *  paired computer reports an outdated `lingxiloop` daemon, and disappears on its own
 *  once the daemon restarts onto the latest (the next heartbeat clears the flag).
 *  Warm gold (an invitation to update), not alarm red. One-click copy. */
function DaemonUpgradeBanner({ onJump }: { onJump: () => void }) {
  const byId = useComputers((s) => s.byId)
  const [copied, setCopied] = useState(false)
  const outdated = Object.values(byId).filter((c) => c.daemonOutdated)
  if (outdated.length === 0) return null

  const latest = outdated.map((c) => c.latestDaemonVersion).find(Boolean) ?? null
  const one = outdated.length === 1 ? outdated[0] : null
  // Run-mode-aware instructions. A supervised daemon (--install-service) is
  // restarted through its launchd/systemd wrapper; a manually-run foreground
  // daemon has no wrapper — the user must Ctrl-C it and re-run the command.
  // Unknown (old daemon not reporting the mode yet) gets the service command,
  // which itself prints install-service guidance when no service exists.
  const manual = outdated.filter((c) => c.daemonSupervised === false)
  const allManual = manual.length === outdated.length
  const cmd = allManual ? 'npx lingxiloop@latest agent computer' : 'npx lingxiloop@latest agent computer --restart'
  const copy = () => { void navigator.clipboard?.writeText(cmd); setCopied(true); window.setTimeout(() => setCopied(false), 1600) }

  return (
    <div className="relative overflow-hidden rounded-[16px] mb-6"
      style={{ border: '1px solid rgba(244,183,64,0.45)', background: 'linear-gradient(135deg, rgba(244,183,64,0.15), rgba(244,183,64,0.035) 70%)' }}>
      <div className="p-4 flex items-start gap-4">
        <div className="shrink-0 mt-0.5 w-9 h-9 rounded-full flex items-center justify-center text-[17px] font-bold"
          style={{ background: 'rgba(244,183,64,0.22)', color: 'var(--gold-deep)' }}>↑</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-display font-semibold text-[15px] text-ink-900">Update available</span>
            {latest && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-mono">
                {one?.daemonVersion && (
                  <span className="px-1.5 py-0.5 rounded-full" style={{ background: 'var(--ink-100)', color: 'var(--ink-500)' }}>v{one.daemonVersion}</span>
                )}
                <span className="text-ink-300">→</span>
                <span className="px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(244,183,64,0.30)', color: 'var(--gold-deep)' }}>v{latest}</span>
              </span>
            )}
          </div>
          <div className="text-[12.5px] text-ink-600 mt-1 leading-relaxed">
            {one ? (
              <><strong className="text-ink-900 font-medium">{one.name}</strong> is running an outdated agent daemon.</>
            ) : (
              <><strong className="text-ink-900 font-medium">{outdated.length} computers</strong> are running an outdated agent daemon: {outdated.map((c) => c.name).join(', ')}.</>
            )}
            {allManual ? (
              <>{' '}{one ? 'It runs' : 'They run'} as a foreground command — press <kbd className="font-mono text-[11px]">Ctrl-C</kbd> in {one ? 'its' : 'each'} terminal, then re-run to update. Tip: <code className="font-mono text-[11px]">--install-service</code> makes updates automatic.</>
            ) : (
              <>
                {' '}Restart {one ? 'it' : 'them'} to pick up the latest fixes — agents stay attached.
                {manual.length > 0 && (
                  <>{' '}({manual.map((c) => c.name).join(', ')} {manual.length === 1 ? 'runs' : 'run'} as a foreground command — Ctrl-C and re-run there instead.)</>
                )}
              </>
            )}
          </div>
          <div className="mt-2.5 flex items-stretch gap-2 max-w-[580px]">
            <code className="flex-1 bg-ink-900 text-cloud rounded-[10px] px-3 py-2 text-[12px] font-mono overflow-x-auto whitespace-nowrap select-all flex items-center">{cmd}</code>
            <button onClick={copy}
              className="shrink-0 inline-flex items-center justify-center min-w-[82px] text-[12px] font-semibold px-3 rounded-[10px] text-white transition-colors duration-200"
              style={{ background: copied ? 'var(--avail)' : 'var(--gold-deep)' }}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <button onClick={onJump} className="mt-2 text-[11.5px] font-semibold text-gold-deep hover:underline" style={{ color: 'var(--gold-deep)' }}>
            Manage computers →
          </button>
        </div>
      </div>
    </div>
  )
}

function MemoryTab() {
  const [items, setItems] = useState<Awaited<ReturnType<typeof api.getLearnedMemories>>>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const load = () => void api.getLearnedMemories().then(setItems).catch((err) => setError(err instanceof Error ? err.message : String(err)))
  useEffect(load, [])
  const kindLabel = (path: string) => ({ fact: '事实', preference: '偏好', instruction: '指令', relationship: '关系' } as Record<string, string>)[path.split('/')[1] ?? ''] ?? '记忆'
  return (
    <section>
      <div className="mb-5">
        <h2 className="text-[18px] font-semibold text-ink-900">Agent 学到了什么</h2>
        <p className="mt-1 text-[12px] text-ink-500">这些记忆会跨会话生效。你可以随时编辑或忘记，普通的一次性聊天不会自动进入这里。</p>
      </div>
      {error && <div className="mb-3 rounded-lg bg-coral-soft/30 px-3 py-2 text-[11px] text-coral-deep">{error}</div>}
      <div className="space-y-3">
        {items.map((item) => {
          const key = `${item.agentId}:${item.path}`
          const isEditing = editing === key
          return (
            <article key={key} className="rounded-xl border border-ink-100 bg-cloud px-4 py-3">
              <div className="flex items-center gap-2 text-[10.5px] font-semibold text-ink-400">
                <span className="text-skype-deep">✦ 已学习{kindLabel(item.path)}</span><span>·</span><span>{item.agentName}</span>
              </div>
              {isEditing ? (
                <textarea value={draft} onChange={(event) => setDraft(event.target.value)} className="mt-2 min-h-20 w-full rounded-lg border border-ink-100 bg-paper px-3 py-2 text-[13px] text-ink-700 outline-none focus:border-skype" />
              ) : <div className="mt-2 whitespace-pre-wrap text-[13px] leading-5 text-ink-700">{item.body}</div>}
              <div className="mt-3 flex gap-2">
                {isEditing ? (
                  <>
                    <button type="button" onClick={() => void api.updateLearnedMemory({ agentId: item.agentId, path: item.path, body: draft }).then(() => { setEditing(null); load() })} className="rounded-lg bg-skype px-3 py-1.5 text-[11px] font-semibold text-white">保存</button>
                    <button type="button" onClick={() => setEditing(null)} className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-ink-500 hover:bg-raised">取消</button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => { setEditing(key); setDraft(item.body) }} className="rounded-lg border border-ink-100 px-3 py-1.5 text-[11px] font-semibold text-ink-600 hover:bg-raised">编辑</button>
                    <button type="button" onClick={() => void api.forgetLearnedMemory(item.agentId, item.path).then(load)} className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-coral-deep hover:bg-coral-soft/30">忘记</button>
                  </>
                )}
              </div>
            </article>
          )
        })}
        {items.length === 0 && <div className="rounded-xl border border-dashed border-ink-100 px-6 py-10 text-center text-[12px] text-ink-400">还没有可见的长期记忆。明确告诉 Agent“以后……”后，学习结果会出现在这里。</div>}
      </div>
    </section>
  )
}

export function MeView() {
  const [tab, setTab] = useState<Tab>('Profile')
  const hasOutdated = useComputers((s) => Object.values(s.byId).some((c) => c.daemonOutdated))
  useEffect(() => { void useComputers.getState().refresh() }, [])

  return (
    <main className="overflow-y-auto p-8 pt-6"
      style={{ background: 'linear-gradient(180deg, transparent, var(--paper))' }}>
      <div className="max-w-[1100px] mx-auto">
        <button type="button" onClick={() => useApp.getState().setView('conversations')} className="mb-4 rounded-lg px-3 py-2 text-[13px] text-ink-600 hover:bg-cloud">← 返回对话</button>
        <div className="mb-6">
          <h1 className="font-display font-medium text-[36px] tracking-tight text-ink-900 mb-1" style={{ letterSpacing: '-0.025em' }}>
            个人中心
          </h1>
          <div className="font-display italic font-normal text-[15px] text-ink-500">
            管理个人资料、设备、项目、权限与偏好设置。
          </div>
        </div>

        <DaemonUpgradeBanner onJump={() => setTab('Computers')} />

        <div className="flex gap-1 mb-7 border-b border-ink-100">
          {tabs.map((t, i) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'py-2.5 text-[13px] font-semibold border-b-2 transition -mb-px inline-flex items-center gap-1.5',
                i === 0 ? 'pl-0 pr-5' : 'px-5',
                tab === t ? 'border-skype text-skype-deep' : 'border-transparent text-ink-500 hover:text-ink-700',
              )}>
              {({ Profile: '个人资料', Usage: '用量', Computers: '设备', Projects: '项目', Memory: '记忆', 'Trust & autonomy': '信任与自主权', Preferences: '偏好设置' } as Record<Tab, string>)[t]}
              {t === 'Computers' && hasOutdated && (
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--gold-deep)' }} title="有设备服务需要更新" />
              )}
            </button>
          ))}
        </div>

        {tab === 'Profile' && <ProfileTab />}
        {tab === 'Usage' && <UsageTab />}
        {tab === 'Computers' && <ComputersTab />}
        {tab === 'Projects' && <ProjectsTab />}
        {tab === 'Memory' && <MemoryTab />}
        {tab === 'Trust & autonomy' && <TrustTab />}
        {tab === 'Preferences' && <PreferencesTab />}
      </div>
    </main>
  )
}
