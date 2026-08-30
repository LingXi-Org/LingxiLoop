import { Button } from '@/components/ui/button'
import { useEffect, useState } from 'react'
import { agentsApi } from '@/features/agents/api'
import { authApi } from '@/auth/api'
import { Avatar } from '@/components/Avatar'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { toastAction } from '@/lib/actionToast'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import { useApp } from '@/stores/app'
import { useAuth } from '@/stores/auth'
import { useParticipants } from '@/features/agents/state'
import { usePrefs } from '@/stores/preferences'
import { useSoundStore } from '@/stores/sound'
import { SubscriptionUnavailableCard } from '@/features/subscriptions/SubscriptionUnavailableCard'

const tabs = ['Profile', 'Memory', 'Trust & autonomy', 'Preferences'] as const
type Tab = (typeof tabs)[number]

const PREF_GROUPS: Array<{ title: string; items: Array<{ key: string; lbl: string; sub: string; default: boolean }> }> = [
  {
    title: '通知',
    items: [
      { key: 'notify.group_pulled', lbl: 'Agent 邀请你加入群聊时', sub: '始终 · 从不 · 仅紧急情况', default: true },
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
  async function signOut() {
    // Server-side: revoke the session row so the token is dead even if it
    // leaks. Best-effort — client clear still happens on network failure.
    try { await authApi.logout() } catch (e) { console.warn('[signout] server call failed', e) }
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
            <div className="font-display text-[14px] text-ink-800">当前会话已通过 LingxiIdentity 验证</div>
            <div className="font-display italic text-[12px] text-ink-400 mt-0.5">
              退出登录会清除本地凭据，并在服务器端撤销当前会话。
            </div>
          </div>
          <Button
            type="button"
            onClick={signOut}
            className="shrink-0 h-9 px-4 rounded-[8px] bg-ink-800 hover:bg-ink-900 text-white text-[13px] font-display transition-colors"
          >
            退出登录
          </Button>
        </div>
      </Section>

      <Section title="↳ 订阅"><SubscriptionUnavailableCard /></Section>

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
        <Button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('lingxiloop:open-updater'))}
          className="shrink-0 h-9 px-4 rounded-[8px] text-[13px] font-display transition-colors text-white"
          style={{ background: 'var(--skype)' }}
        >
          检查更新
        </Button>
      </div>
    </Section>
  )
}

function TrustTab() {
  const byId = useParticipants((s) => s.byId)
  const autonomy = usePrefs((s) => s.autonomy)
  const setAutonomy = usePrefs((s) => s.setAutonomy)
  const agents = Object.values(byId).filter((p) => p.kind === 'agent' && !p.managed)
  const [rules, setRules] = useState<Awaited<ReturnType<typeof agentsApi.getAutonomyRules>>>([])
  const [rulesError, setRulesError] = useState<string | null>(null)
  const loadRules = () => void agentsApi.getAutonomyRules().then(setRules).catch((error) => {
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
                  <Avatar p={a} size={36} />
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
                  <Slider min={0} max={1} step={0.01} value={[trust]}
                    onValueChange={([value]) => setAutonomy(a.id, value ?? trust)}
                    className="w-full" />
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
              <Button type="button" onClick={async () => {
                if (!await confirmSensitiveAction({
                  title: '撤销自治规则？',
                  description: `撤销后，${byId[rule.agentId]?.name ?? rule.agentId} 的 ${rule.scope}.${rule.operation} 操作将恢复默认审批策略。`,
                  confirmLabel: '撤销规则',
                  tone: 'destructive',
                })) return
                try {
                  await toastAction(agentsApi.deleteAutonomyRule(rule.id), { loading: '正在撤销自治规则', success: '自治规则已撤销', error: '撤销自治规则失败' })
                  await loadRules()
                } catch { /* toast owns the visible error state */ }
              }} className="shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-coral-deep hover:bg-coral-soft/30">
                撤销
              </Button>
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
                  <Avatar p={a} size={28} />
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

function PreferencesTab() {
  const prefs = usePrefs((s) => s.prefs)
  const setPref = usePrefs((s) => s.setPref)
  const get = (k: string, fallback: boolean) => (prefs[k] === undefined ? fallback : Boolean(prefs[k]))

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[10.5px] font-extrabold text-skype tracking-[0.14em] uppercase mb-3">{title}</h4>
      {children}
    </div>
  )
}

function MemoryTab() {
  const [items, setItems] = useState<Awaited<ReturnType<typeof agentsApi.getLearnedMemories>>>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const load = () => void agentsApi.getLearnedMemories().then(setItems).catch((err) => setError(err instanceof Error ? err.message : String(err)))
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
                <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} className="mt-2 min-h-20 w-full rounded-lg border border-ink-100 bg-paper px-3 py-2 text-[13px] text-ink-700 outline-none focus:border-skype" />
              ) : <div className="mt-2 whitespace-pre-wrap text-[13px] leading-5 text-ink-700">{item.body}</div>}
              <div className="mt-3 flex gap-2">
                {isEditing ? (
                  <>
                    <Button type="button" onClick={() => void agentsApi.updateLearnedMemory({ agentId: item.agentId, path: item.path, body: draft }).then(() => { setEditing(null); load() })} className="rounded-lg bg-skype px-3 py-1.5 text-[11px] font-semibold text-white">保存</Button>
                    <Button type="button" onClick={() => setEditing(null)} className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-ink-500 hover:bg-raised">取消</Button>
                  </>
                ) : (
                  <>
                    <Button type="button" onClick={() => { setEditing(key); setDraft(item.body) }} className="rounded-lg border border-ink-100 px-3 py-1.5 text-[11px] font-semibold text-ink-600 hover:bg-raised">编辑</Button>
                    <Button type="button" onClick={() => void agentsApi.forgetLearnedMemory(item.agentId, item.path).then(load)} className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-coral-deep hover:bg-coral-soft/30">忘记</Button>
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

export function MeView({ initialTab = 'Profile' }: { initialTab?: 'Profile' | 'Preferences' } = {}) {
  const [tab, setTab] = useState<Tab>(initialTab)

  return (
    <main className="overflow-y-auto p-8 pt-6"
      style={{ background: 'linear-gradient(180deg, transparent, var(--paper))' }}>
      <div className="max-w-[1100px] mx-auto">
        <Button type="button" onClick={() => useApp.getState().setView('conversations')} className="mb-4 rounded-lg px-3 py-2 text-[13px] text-ink-600 hover:bg-cloud">← 返回对话</Button>
        <div className="mb-6">
          <h1 className="font-display font-medium text-[36px] tracking-tight text-ink-900 mb-1" style={{ letterSpacing: '-0.025em' }}>
            个人中心
          </h1>
          <div className="font-display italic font-normal text-[15px] text-ink-500">
            管理个人资料、设备、项目、权限与偏好设置。
          </div>
        </div>

        <div className="flex gap-1 mb-7 border-b border-ink-100">
          {tabs.map((t, i) => (
            <Button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'py-2.5 text-[13px] font-semibold border-b-2 transition -mb-px inline-flex items-center gap-1.5',
                i === 0 ? 'pl-0 pr-5' : 'px-5',
                tab === t ? 'border-skype text-skype-deep' : 'border-transparent text-ink-500 hover:text-ink-700',
              )}>
              {({ Profile: '个人资料', Memory: '记忆', 'Trust & autonomy': '信任与自主权', Preferences: '偏好设置' } as Record<Tab, string>)[t]}
            </Button>
          ))}
        </div>

        {tab === 'Profile' && <ProfileTab />}
        {tab === 'Memory' && <MemoryTab />}
        {tab === 'Trust & autonomy' && <TrustTab />}
        {tab === 'Preferences' && <PreferencesTab />}
      </div>
    </main>
  )
}
