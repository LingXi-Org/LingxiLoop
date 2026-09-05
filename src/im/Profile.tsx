import { Button } from '@/components/ui/button'
import { contextThreadsApi } from '@/features/context-threads/api'
import { motion, useMotionValue, useTransform } from 'framer-motion'
import { useRef, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { IMail } from '@/components/icons'
import { cn } from '@/lib/utils'
import { useApp } from '@/stores/app'
import { useMe } from '@/stores/auth'
import { useConversations } from '@/features/conversations/store'
import { useParticipants } from '@/features/agents/state'
import { useWorkspace } from '@/features/knowledge/workspace'
import { participantRoleZh } from '@/lib/participantRole'

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
      <h3 className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-primary">{title}</h3>
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
  const projectId = useWorkspace((state) => state.selectedId)

  if (!participant) return null
  const isAgent = participant.kind === 'agent'
  const isManaged=participant.managed===true
  const isSelf = participant.id === meId
  const statusColor = STATUS_COLOR[participant.status] ?? 'var(--resting)'
  const roleLabel = participantRoleZh(participant) ?? (isAgent ? '智能助教' : '学习区成员')
  const toolLabels = [...new Set((participant.tools ?? []).map((tool) => tool === 'ipython' ? '数据分析' : '扩展能力'))]

  const openLearningThread = async () => {
    if (opening || isSelf || !isAgent || !projectId) return
    setOpening(true)
    try {
      const conversation = await contextThreadsApi.openLearning(projectId, participant.id)
      await useConversations.getState().reload()
      setView('conversations')
      selectConversation(conversation.id)
      onClose()
    } catch (error) {
      console.warn('[profile] learning context failed', error)
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
    <aside className="im-profile relative flex h-full min-h-0 flex-col overflow-hidden bg-panel">
      <div
        className="absolute inset-x-0 top-0 z-20 flex h-14 items-center border-b border-hairline bg-panel/88 px-2 backdrop-blur-xl"
      >
        <Button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-full text-ink-secondary hover:bg-raised" aria-label="关闭资料">
          <span className="text-xl leading-none">×</span>
        </Button>
        <motion.div style={{ opacity: compactOpacity }} className="ml-1 flex min-w-0 items-center gap-2.5">
          <Avatar p={participant} size={32} ringColor="var(--panel)" />
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-semibold text-ink">{participant.name}</span>
            <span className="block truncate text-[10px] text-ink-secondary">{roleLabel}</span>
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
          <p className="relative mt-0.5 text-[12px] text-ink-secondary">{roleLabel}</p>
          <span className="relative mt-3 inline-flex items-center gap-1.5 rounded-full border border-hairline bg-panel/90 px-3 py-1.5 text-[11px] text-ink-secondary shadow-soft">
            <span className="size-1.5 rounded-full" style={{ background: statusColor }} />
            {STATUS_LABEL[participant.status] ?? '空闲'}
          </span>
        </motion.div>

        <ProfileSection title="操作">
          {isManaged ? (
            <div className="rounded-xl bg-raised px-4 py-3 text-[12px] leading-relaxed text-ink-secondary">课程智能助教仅在学习区中使用，不支持私聊、创建群聊或收发邮件。</div>
          ) : isSelf ? null : isAgent ? (
            <div className="grid gap-2">
              <Button type="button" onClick={() => void openLearningThread()} disabled={opening || !projectId} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-[12px] font-semibold text-primary-foreground shadow-soft transition active:scale-[0.97] disabled:opacity-50">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                {opening ? '打开中…' : '打开学习线程'}
              </Button>
            </div>
          ) : (
            <div className="rounded-xl bg-raised px-4 py-3 text-[12px] leading-relaxed text-ink-secondary">
              请在所属课程或学习任务中与该成员联系。
            </div>
          )}
        </ProfileSection>

        {participant.email && (
          <ProfileSection title="邮箱">
            <Button type="button" onClick={() => void copyEmail()} className="flex w-full items-center gap-2.5 rounded-xl bg-raised px-3 py-2.5 text-left font-mono text-[12px] text-ink">
              <IMail className="size-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate">{participant.email}</span>
              <span className={cn('text-[9px] font-bold uppercase tracking-wider', copied ? 'text-avail' : 'text-ink-secondary')}>{copied ? '已复制' : '复制'}</span>
            </Button>
          </ProfileSection>
        )}

        {isAgent && toolLabels.length > 0 && (
          <ProfileSection title="可用工具">
            <div className="flex flex-wrap gap-1.5">
              {toolLabels.map((tool) => <span key={tool} className="rounded-lg bg-raised px-2.5 py-1.5 text-[11px] text-ink-secondary">{tool}</span>)}
            </div>
          </ProfileSection>
        )}

        {participant.bio && (
          <ProfileSection title={`关于 ${participant.name}`}>
            <p className="border-l-2 border-primary pl-3 text-[13px] leading-relaxed text-ink-secondary">{participant.bio}</p>
          </ProfileSection>
        )}
        <div className="h-[max(24px,env(safe-area-inset-bottom))]" />
      </div>
    </aside>
  )
}
