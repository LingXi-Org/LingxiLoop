import { conversationsApi } from '@/features/conversations/api'
import { motion, useMotionValue, useTransform } from 'framer-motion'
import { useRef, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { IConvene, IDirectChat, IMail } from '@/components/icons'
import { cn } from '@/lib/utils'
import { useApp } from '@/stores/app'
import { useMe } from '@/stores/auth'
import { useConversations } from '@/features/conversations/store'
import { useParticipants } from '@/features/agents/state'

const STATUS_LABEL: Record<string, string> = {
  avail: '可用',
  working: '工作中',
  thinking: '思考中',
  waiting: '等待你确认',
  resting: '休息中',
}

const STATUS_COLOR: Record<string, string> = {
  avail: 'var(--avail)',
  working: 'var(--working)',
  thinking: 'var(--thinking)',
  waiting: 'var(--waiting)',
  resting: 'var(--resting)',
}

function ProfileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-hairline bg-panel px-5 py-4 last:border-b-0">
      <h3 className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-accent">{title}</h3>
      {children}
    </section>
  )
}

/** Participant profile for the responsive Web/Desktop shell. */
export function ParticipantProfile({
  participantId,
  onClose,
}: {
  participantId: string
  onClose: () => void
}) {
  const participant = useParticipants((state) => state.byId[participantId])
  const meId = useMe()
  const selectConversation = useApp((state) => state.selectConversation)
  const setView = useApp((state) => state.setView)
  const scrollTop = useMotionValue(0)
  const compactOpacity = useTransform(scrollTop, [36, 92], [0, 1])
  const heroScale = useTransform(scrollTop, [0, 120], [1, 0.78])
  const heroOpacity = useTransform(scrollTop, [44, 126], [1, 0])
  const heroY = useTransform(scrollTop, [0, 120], [0, -18])
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [opening, setOpening] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!participant) return null
  const isAgent = participant.kind === 'agent'
  const isManaged=participant.managed===true
  const isSelf = participant.id === meId
  const statusColor = STATUS_COLOR[participant.status] ?? 'var(--resting)'

  const startDM = async () => {
    if (opening || isSelf) return
    setOpening(true)
    try {
      const conversation = await conversationsApi.openDirect(participant.id)
      await useConversations.getState().reload()
      setView('conversations')
      selectConversation(conversation.id)
      onClose()
    } catch (error) {
      console.warn('[profile] open direct failed', error)
    } finally {
      setOpening(false)
    }
  }

  const copyEmail = async () => {
    if (!participant.email) return
    try {
      await navigator.clipboard.writeText(participant.email)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard permissions are not guaranteed in every webview.
    }
  }

  return (
    <aside className="im-profile relative flex h-full min-h-0 flex-col overflow-hidden bg-app">
      <div
        className="absolute inset-x-0 top-0 z-20 flex h-14 items-center border-b border-hairline bg-panel/88 px-2 backdrop-blur-xl"
      >
        <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-full text-ink-secondary hover:bg-raised" aria-label="关闭资料">
          <span className="text-xl leading-none">×</span>
        </button>
        <motion.div style={{ opacity: compactOpacity }} className="ml-1 flex min-w-0 items-center gap-2.5">
          <Avatar p={participant} size={32} ringColor="var(--panel)" showStatus={false} />
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-semibold text-ink">{participant.name}</span>
            <span className="block truncate text-[10px] text-ink-secondary">{participant.role ?? (isAgent ? 'Agent' : 'Member')}</span>
          </span>
        </motion.div>
      </div>

      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-14"
        onScroll={(event) => scrollTop.set(event.currentTarget.scrollTop)}
      >
        <motion.div
          className="relative overflow-hidden border-b border-hairline px-5 pb-6 pt-7 text-center"
          style={{ opacity: heroOpacity }}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,var(--sky2-100),transparent_72%)]" />
          <motion.div style={{ scale: heroScale, y: heroY }} className="relative mx-auto mb-3 w-fit origin-top">
            <Avatar p={participant} size={96} ringColor="var(--panel)" />
          </motion.div>
          <h2 className="relative truncate text-[25px] font-semibold tracking-[-0.025em] text-ink">{participant.name}</h2>
          <p className="relative mt-0.5 text-[12px] text-ink-secondary">{participant.role ?? (isAgent ? 'Agent' : 'Workspace member')}</p>
          <span className="relative mt-3 inline-flex items-center gap-1.5 rounded-full border border-hairline bg-panel/90 px-3 py-1.5 text-[11px] text-ink-secondary shadow-soft">
            <span className="size-1.5 rounded-full" style={{ background: statusColor }} />
            {STATUS_LABEL[participant.status] ?? 'Idle'}
          </span>
        </motion.div>

        <ProfileSection title="Actions">
          {isManaged ? (
            <div className="rounded-xl bg-raised px-4 py-3 text-[12px] leading-relaxed text-ink-secondary">Pulse 仅在学习中心的共享教师室中使用，不支持私聊、召开群组或邮件。</div>
          ) : isSelf ? (
            <button type="button" onClick={() => { setView('me'); onClose() }} className="w-full rounded-xl bg-raised px-4 py-3 text-[13px] font-semibold text-accent hover:bg-raised-hover">打开我的设置</button>
          ) : (
            <div className={cn('grid gap-2', isAgent ? 'grid-cols-3' : 'grid-cols-1')}>
              <button type="button" onClick={() => void startDM()} disabled={opening} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-accent px-3 text-[12px] font-semibold text-white shadow-soft transition active:scale-[0.97] disabled:opacity-50">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                {opening ? '打开中…' : '消息'}
              </button>
              {isAgent && (
                <>
                  <button type="button" className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-skype-ink px-3 text-[12px] font-semibold text-white transition active:scale-[0.97]"><IDirectChat className="size-4" />私聊</button>
                  <button type="button" className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-hairline bg-panel px-3 text-[12px] font-semibold text-ink transition active:scale-[0.97]"><IConvene className="size-4" />召开</button>
                </>
              )}
            </div>
          )}
        </ProfileSection>

        {participant.email && (
          <ProfileSection title="Email">
            <button type="button" onClick={() => void copyEmail()} className="flex w-full items-center gap-2.5 rounded-xl bg-raised px-3 py-2.5 text-left font-mono text-[12px] text-ink">
              <IMail className="size-4 shrink-0 text-accent" />
              <span className="min-w-0 flex-1 truncate">{participant.email}</span>
              <span className={cn('text-[9px] font-bold uppercase tracking-wider', copied ? 'text-avail' : 'text-ink-secondary')}>{copied ? '已复制' : '复制'}</span>
            </button>
          </ProfileSection>
        )}

        {isAgent && (participant.tools?.length ?? 0) > 0 && (
          <ProfileSection title="Tools">
            <div className="flex flex-wrap gap-1.5">
              {(participant.tools ?? []).map((tool) => <span key={tool} className="rounded-lg bg-raised px-2.5 py-1.5 font-mono text-[11px] text-ink-secondary">{tool}</span>)}
            </div>
          </ProfileSection>
        )}

        {participant.bio && (
          <ProfileSection title={`About ${participant.name}`}>
            <p className="border-l-2 border-accent pl-3 text-[13px] leading-relaxed text-ink-secondary">{participant.bio}</p>
          </ProfileSection>
        )}
        <div className="h-[max(24px,env(safe-area-inset-bottom))]" />
      </div>
    </aside>
  )
}
