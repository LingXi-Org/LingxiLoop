import { MessagePrimitive } from '@assistant-ui/react'
import { cn } from '@/lib/utils'
import { useSurface } from '@/stores/surface'
import { useParticipants } from '@/features/agents/state'
import type { Participant } from '@/types'
import { Avatar } from '../Avatar'
import { CalendarLink } from '@/features/calendar/components/CalendarLink'

export function SystemRow({ msg, delay = 0, animate = true, openMaus = false }: { msg: { body: string }; delay?: number; animate?: boolean; openMaus?: boolean }) {
  const byId = useParticipants((state) => state.byId)
  const openAgentInfo = useSurface((state) => state.openAgentInfo)
  const rootProps = { className: cn('flex justify-center my-3', animate && 'animate-rise'), style: animate ? { animationDelay: `${delay}ms` } : undefined }
  let payload: { kind?: string; participantId?: string; actorId?: string; text?: string; title?: string; eventId?: string } = {}
  try { payload = JSON.parse(msg.body) } catch { return null }

  if (payload.kind === 'notice' && typeof payload.text === 'string') return <MessagePrimitive.Root {...rootProps} data-message-shell="system">
    <div data-message-surface="status" data-card-status="failed" className="max-w-[min(100%,540px)] flex items-start gap-2 px-3 py-1.5 rounded-md bg-coral-soft/60 border border-coral-soft text-coral-deep text-[11.5px] font-display">
      <span className="leading-[1.4] shrink-0">⚠</span><span className="leading-[1.4]">{payload.text}</span>
    </div>
  </MessagePrimitive.Root>

  if (payload.kind === 'calendar_event') {
    const title = typeof payload.title === 'string' && payload.title.trim() ? payload.title.trim() : (openMaus ? '日历事件' : 'Calendar event')
    return <MessagePrimitive.Root {...rootProps} data-message-shell="system">
      <div data-message-surface="status" className="max-w-[min(100%,540px)] flex items-center gap-2 px-3 py-1.5 rounded-md bg-skype/10 border border-skype/20 text-skype text-[11.5px] font-display">
        <span className="leading-[1.4] shrink-0">📅</span><span className="leading-[1.4]">{openMaus ? '日历提醒：' : '日历已触发：'}{title}</span>
        {!openMaus && typeof payload.eventId === 'string' && <CalendarLink id={payload.eventId} />}
      </div>
    </MessagePrimitive.Root>
  }

  const subject = payload.participantId ? byId[payload.participantId] : undefined
  if (!subject) return null
  const actor = payload.kind === 'kicked' && payload.actorId ? byId[payload.actorId] : null
  const openSubject = () => { if (!openMaus) openAgentInfo(subject.id) }
  return <MessagePrimitive.Root {...rootProps} data-message-shell="system">
    <div className="text-[11.5px] text-ink-300 italic font-display flex items-center gap-1.5 flex-wrap justify-center">
      {payload.kind === 'kicked' && actor ? <>
        <SystemActor participant={actor} onClick={() => { if (!openMaus) openAgentInfo(actor.id) }} disabled={openMaus} />
        <span>— {openMaus ? '将' : '已删除'}</span><SystemActor participant={subject} onClick={openSubject} disabled={openMaus} /><span>{openMaus ? '移出群聊' : '来自小组'}</span>
      </> : <>
        <SystemActor participant={subject} onClick={openSubject} disabled={openMaus} />
        <span>— {payload.kind === 'joined' ? (openMaus ? '加入了群聊' : '已加入群组') : payload.kind === 'left' ? (openMaus ? '退出了群聊' : '退群') : openMaus ? '更新了群聊' : payload.kind ?? 'updated the group'}</span>
      </>}
    </div>
  </MessagePrimitive.Root>
}

function SystemActor({ participant, onClick, disabled = false }: { participant: Participant; onClick: () => void; disabled?: boolean }) {
  return <button onClick={onClick} disabled={disabled || participant.kind !== 'agent'} className="inline-flex items-center gap-1.5 not-italic font-semibold text-ink-500 hover:text-skype-deep transition disabled:cursor-default disabled:hover:text-ink-500">
    <Avatar p={participant} size={16} ringColor="var(--paper)" showStatus={false} />{participant.name}
  </button>
}
