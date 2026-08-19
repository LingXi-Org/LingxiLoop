/**
 * Mobile participant detail screen — mirrors the desktop InfoPane in
 * function but adopts the mobile shell's visual vocabulary so it lands
 * inside the rest of the app (↳ section markers, skype-blue headers,
 * cloud-card surfaces, font-display italic personality text) rather
 * than feeling bolted-on from desktop.
 *
 * Triggered by tapping an avatar or @mention chip inside MobileChat;
 * MobileApp watches `useApp.infoAgentId` and slides this view in.
 *
 * Actions:
 *  - DM: opens (or reuses) a direct conversation. Reuses
 *    /conversations/direct so an existing DM is preserved.
 *  - Email copy (humans only): one tap to clipboard, inline confirm.
 *  - Whisper / Convene placeholders for agents — kept in lockstep with
 *    desktop so the surface doesn't diverge.
 */
import { useState } from 'react'
import { useApp } from '@/stores/app'
import { useParticipants } from '@/stores/participants'
import { useConversations } from '@/stores/conversations'
import { useMe } from '@/stores/auth'
import { Avatar } from '@/components/Avatar'
import { IBack, IMail, IConvene, IWhisper } from '@/components/icons'
import { api } from '@/api/client'
import { tapHaptic } from '@/lib/native'
import { cn } from '@/lib/utils'

const STATUS_LABEL: Record<string, string> = {
  avail: 'Available',
  working: 'Working',
  thinking: 'Thinking',
  waiting: 'Waiting on you',
  resting: 'Resting',
}
const STATUS_COLOR: Record<string, string> = {
  avail: 'var(--avail)',
  working: 'var(--working)',
  thinking: 'var(--thinking)',
  waiting: 'var(--waiting)',
  resting: 'var(--resting)',
}

export function MobileParticipantInfo() {
  const participantId = useApp((s) => s.infoAgentId)
  const close = useApp((s) => s.closeAgentInfo)
  const select = useApp((s) => s.selectConversation)
  const setView = useApp((s) => s.setView)
  const byId = useParticipants((s) => s.byId)
  const meId = useMe()
  const p = participantId ? byId[participantId] : undefined
  const [opening, setOpening] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!p) return null

  // The shared MessageRow / MentionChip already gate self-clicks, but be
  // defensive — a deep link or future caller could still ask for me.
  // Show a gentle "head to Me" nudge rather than the action surface.
  if (p.id === meId) {
    return (
      <section className="flex flex-col h-full overflow-hidden bg-paper">
        <DeepHeader title="简介" onBack={close} />
        <div className="flex-1 grid place-items-center px-8 text-center">
          <div className="font-display italic text-[13px] text-ink-500">
            这就是你——前往 <span className="text-skype-deep font-semibold not-italic">我的</span> 为您自己的个人资料。
          </div>
        </div>
      </section>
    )
  }

  const isAgent = p.kind === 'agent'
  const statusColor = STATUS_COLOR[p.status] ?? 'var(--resting)'
  const subtitle = p.role ?? (isAgent ? 'agent' : 'human teammate')
  // Sky wash for agents, coral for humans — matches the chip colour
  // scheme used by MentionChip elsewhere so the page lands "feeling
  // like" the chip the user just tapped.
  const heroBg = isAgent
    ? 'radial-gradient(circle at 50% 0%, var(--sky-100), transparent 70%)'
    : 'radial-gradient(circle at 50% 0%, var(--coral-soft), transparent 70%)'

  const startDM = async () => {
    if (opening) return
    setOpening(true)
    void tapHaptic()
    try {
      const r = await api.openDirect(p.id)
      // Refresh so the (possibly brand-new) DM is in the store before
      // we navigate into it.
      await useConversations.getState().reload()
      setView('conversations')
      // selectConversation also flips mobileStack='chat' — user lands
      // directly inside the DM, no intermediate list view.
      select(r.id)
      close()
    } catch (err) {
      console.warn('[dm] open failed', err)
    } finally {
      setOpening(false)
    }
  }

  const copyEmail = async () => {
    if (!p.email) return
    try {
      await navigator.clipboard.writeText(p.email)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard can fail in unusual contexts — silently degrade.
    }
  }

  return (
    <section className="flex flex-col h-full overflow-hidden bg-paper">
      <DeepHeader title={p.name} onBack={close} />

      <div className="flex-1 overflow-y-auto pb-10">
        {/* Hero — large avatar + name + role + status pill, matching
            the MobileMe header silhouette so the user feels at home. */}
        <div
          className="text-center pt-5 pb-5 px-5 border-b border-ink-100"
          style={{ background: heroBg }}
        >
          <div className="mx-auto mb-2.5 inline-block">
            <Avatar p={p} size={88} />
          </div>
          <h2
            className="font-display font-medium text-[26px] tracking-tight text-ink-900"
            style={{ letterSpacing: '-0.025em' }}
          >
            {p.name}
          </h2>
          <div className="font-display italic text-[13px] text-ink-500 mb-2.5">
            {subtitle}
          </div>
          <div className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-full bg-cloud border border-ink-100 text-[11.5px] text-ink-700">
            <span className="w-[7px] h-[7px] rounded-full" style={{ background: statusColor }} />
            {STATUS_LABEL[p.status] ?? 'idle'}
          </div>
        </div>

        <Section title="行动">
          <div className={cn('grid gap-2', isAgent ? 'grid-cols-3' : 'grid-cols-1')}>
            <button
              type="button"
              onClick={startDM}
              disabled={opening}
              className="py-3 px-3 text-white rounded-[12px] text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5 transition disabled:opacity-50 active:scale-[0.97]"
              style={{
                background: 'linear-gradient(135deg, var(--skype), var(--skype-deep))',
                boxShadow: '0 4px 14px -3px rgba(0, 168, 240, 0.5)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {opening ? "开幕..." : 'DM'}
            </button>
            {/* Whisper / Convene mirror the desktop pane — agent-team
                rituals only. Placeholder buttons today; kept on screen
                so the surface stays in lockstep with desktop. */}
            {isAgent && (
              <>
                <button
                  type="button"
                  className="py-3 px-3 rounded-[12px] text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5 text-white active:scale-[0.97] transition"
                  style={{ background: 'var(--skype-ink)' }}
                >
                  <IWhisper className="w-[14px] h-[14px]" />
                  私聊
                </button>
                <button
                  type="button"
                  className="py-3 px-3 bg-cloud rounded-[12px] text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5 text-ink-700 active:scale-[0.97] active:border-sky2-200 transition"
                  style={{ border: '1px solid var(--ink-100)' }}
                >
                  <IConvene className="w-[14px] h-[14px]" />
                  召开
                </button>
              </>
            )}
          </div>
        </Section>

        {p.email && (
          <Section title="电子邮件">
            <button
              type="button"
              onClick={copyEmail}
              className="w-full py-2.5 px-3 bg-cloud rounded-[12px] flex items-center gap-2 text-[12px] text-ink-700 font-mono active:opacity-80 transition text-left"
              style={{ border: '1px solid var(--ink-100)' }}
              title={copied ? "已复制！" : "点击复制"}
            >
              <IMail className="w-3.5 h-3.5 shrink-0 text-skype-deep" strokeWidth={2} />
              <span className="truncate flex-1">{p.email}</span>
              <span
                className={cn(
                  'text-[10px] uppercase tracking-wider shrink-0 transition-colors',
                  copied ? 'text-avail' : 'text-ink-300',
                )}
              >
                {copied ? "已复制" : "复制"}
              </span>
            </button>
          </Section>
        )}

        {isAgent && (p.tools?.length ?? 0) > 0 && (
          <Section title="工具已启用">
            <div className="grid grid-cols-2 gap-1.5">
              {(p.tools ?? []).map((t) => (
                <div
                  key={t}
                  className="py-2.5 px-3 bg-cloud rounded-[10px] flex items-center gap-2 text-[12px] text-ink-700"
                  style={{ border: '1px solid var(--ink-100)' }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-avail shrink-0" />
                  <b className="font-mono font-medium text-[11.5px] truncate">{t}</b>
                </div>
              ))}
            </div>
          </Section>
        )}

        {isAgent && p.bio && (
          <Section title={`About ${p.name}`}>
            <div
              className="py-3 px-3.5 rounded-r-[10px] font-display italic font-normal text-[13.5px] leading-[1.55] text-ink-700"
              style={{
                background: 'linear-gradient(135deg, var(--sky-50), transparent)',
                borderLeft: '2px solid var(--skype)',
              }}
            >
              {p.bio}
            </div>
          </Section>
        )}
      </div>
    </section>
  )
}

/** Sticky deep-page header — back arrow + screen title. Matches the
 *  pattern used by MobileChatInfo so deep navigation feels uniform. */
function DeepHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header
      className="border-b border-ink-100 bg-cloud/95 backdrop-blur-md sticky top-0 z-10"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="px-2 py-2.5 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="w-9 h-9 grid place-items-center rounded-full active:bg-sky2-50 transition text-ink-700"
          aria-label="返回"
        >
          <IBack className="w-[18px] h-[18px]" />
        </button>
        <span className="font-display italic text-[15px] text-ink-700 truncate flex-1">
          {title}
        </span>
      </div>
    </header>
  )
}

/** Section header — `↳ TITLE` in skype-blue extrabold caps, matching
 *  MobileMe / MobileChatInfo. Kept local rather than imported so this
 *  file stays a self-contained mobile screen. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 pt-5">
      <h4 className="text-[10.5px] font-extrabold text-skype tracking-[0.14em] uppercase mb-2.5">
        ↳ {title}
      </h4>
      {children}
    </div>
  )
}
