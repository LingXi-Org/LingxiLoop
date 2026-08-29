import { Button } from '@/components/ui/button'
import { useEffect, useRef, useState } from 'react'
import { AvatarMini } from '@/components/Avatar'
import { PeekHeader, PeekLoading, PeekUnavailable, formatShortDate } from '@/components/ArtifactPeekPrimitives'
import { ICalendar, IClock, IRepeat } from '@/components/icons'
import { useParticipants } from '@/features/agents/state'
import { useConversations } from '@/features/conversations/store'
import { toastAction } from '@/lib/actionToast'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import type { CalendarEvent, RecurrenceRule } from '../contracts'
import { useCalendar } from '../state'
import { EventEditor } from './EventEditor'

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const STATUS_LABEL = {
  active: '进行中',
  paused: '已暂停',
  done: '已完成',
  cancelled: '已取消',
} as const

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function formatEventRange(event: CalendarEvent): string {
  const start = new Date(event.startAt)
  if (Number.isNaN(start.getTime())) return event.allDay ? '全天' : '时间不可用'
  if (event.allDay) return start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const startLabel = `${start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${formatTime(start)}`
  if (!event.endAt) return startLabel
  const end = new Date(event.endAt)
  if (Number.isNaN(end.getTime())) return startLabel
  const sameDay = start.toDateString() === end.toDateString()
  return sameDay
    ? `${startLabel}–${formatTime(end)}`
    : `${startLabel}–${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${formatTime(end)}`
}

function describeRecurrence(recurrence: RecurrenceRule | null): string {
  if (!recurrence) return '不重复'
  const interval = recurrence.interval > 1 ? `每 ${recurrence.interval} ` : '每'
  const frequency = { daily: '天', weekly: '周', monthly: '月', yearly: '年' } as const
  const base = `${interval}${frequency[recurrence.freq]}`
  if (recurrence.freq === 'weekly' && recurrence.byweekday?.length) {
    return `${base} · ${recurrence.byweekday.map((day) => WEEK[day]).join('/')}`
  }
  return base
}

export function CalendarEventPeekContent({
  eventId,
  onClose,
  onOpenFull,
}: {
  eventId: string
  onClose: () => void
  onOpenFull?: () => void
}) {
  const loadingEventId = useCalendar((state) => state.loadingEventId)
  const loadEvent = useCalendar((state) => state.loadEvent)
  const removeEvent = useCalendar((state) => state.remove)
  const runEventNow = useCalendar((state) => state.runNow)
  const event = useCalendar((state) => state.events.find((item) => item.id === eventId) ?? null)
  const byId = useParticipants((state) => state.byId)
  const conversations = useConversations((state) => state.list)
  const assignee = event?.assigneeId ? byId[event.assigneeId] : null
  const targetConversation = event?.targetConversationId
    ? conversations.find((conversation) => conversation.id === event.targetConversationId) ?? null
    : null
  const didRequestCalendar = useRef(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState<null | 'delete' | 'run'>(null)

  useEffect(() => {
    if (!event && loadingEventId !== eventId && !didRequestCalendar.current) {
      didRequestCalendar.current = true
      void loadEvent(eventId).catch((error) => {
        setFailed(error instanceof Error ? error.message : String(error))
      })
    }
  }, [event, eventId, loadEvent, loadingEventId])

  if (!event && !failed) {
    return <PeekLoading icon={<ICalendar className="w-5 h-5" />} label="正在加载日历事件" />
  }

  if (!event) {
    return (
      <PeekUnavailable
        icon={<ICalendar className="w-5 h-5" />}
        title="日历事件不可用"
        detail={failed || '该事件可能已被删除，或不属于当前工作区。'}
        onClose={onClose}
      />
    )
  }

  return (
    <div className="h-full min-h-0 flex flex-col bg-cloud">
      <PeekHeader
        icon={<ICalendar className="w-5 h-5" />}
        label="日历事件"
        title={event.title || '未命名事件'}
        meta={`${event.kind === 'agent_task' ? '智能体任务' : '个人事件'} · ${STATUS_LABEL[event.status]}`}
        onClose={onClose}
        onOpenFull={onOpenFull}
      />
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        <section className="rounded-[12px] border border-ink-100 bg-white/75 p-4">
          <div className="flex items-center gap-2 text-[12.5px] font-medium text-ink-800">
            <IClock className="w-4 h-4 text-skype-deep" />
            <span>{formatEventRange(event)}</span>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[12px] text-ink-500">
            <IRepeat className="w-3.5 h-3.5" />
            <span>{describeRecurrence(event.recurrence)}</span>
          </div>
          {event.description && (
            <p className="mt-4 text-[13px] leading-relaxed text-ink-700 whitespace-pre-wrap">{event.description}</p>
          )}
        </section>

        <div className="mt-3 grid gap-3">
          {assignee && (
            <section className="rounded-[12px] border border-ink-100 bg-white/65 p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">执行者</div>
              <div className="mt-2 flex items-center gap-2">
                <AvatarMini p={assignee} size={24} />
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-ink-900">{assignee.name}</div>
                  <div className="truncate text-[11.5px] text-ink-500">{assignee.role || assignee.kind}</div>
                </div>
              </div>
            </section>
          )}

          {targetConversation && (
            <section className="rounded-[12px] border border-ink-100 bg-white/65 p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">目标会话</div>
              <div className="mt-1 truncate text-[13px] font-semibold text-ink-900">{targetConversation.title}</div>
              {targetConversation.subtitle && (
                <div className="mt-0.5 truncate text-[11.5px] text-ink-500">{targetConversation.subtitle}</div>
              )}
            </section>
          )}

          {event.agentPrompt && (
            <section className="rounded-[12px] border border-sky2-100 bg-sky2-50/45 p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-skype-deep">任务说明</div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-700 whitespace-pre-wrap">{event.agentPrompt}</p>
            </section>
          )}
        </div>
      </div>
      <div
        className="shrink-0 border-t border-ink-100 px-4 py-3 flex items-center gap-2"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
      >
        <div className="flex-1 min-w-0 text-[11px] text-ink-400 truncate">
          创建于 {formatShortDate(event.createdAt)} · 更新于 {formatShortDate(event.updatedAt)}
        </div>
        {event.kind === 'agent_task' && (
          <Button
            type="button"
            onClick={async () => {
              if (busy) return
              setBusy('run')
              try {
                await toastAction(runEventNow(event.id), {
                  loading: '正在运行日历任务',
                  success: '任务已触发',
                  error: '任务触发失败',
                  description: event.title || '未命名事件',
                })
              } catch (error) {
                console.warn('runNow failed', error)
              } finally {
                setBusy(null)
              }
            }}
            disabled={busy !== null}
            className="py-1.5 px-3 text-[12px] font-semibold rounded-full bg-sky2-50 text-skype-deep border border-sky2-100 active:bg-sky2-100 transition disabled:opacity-60"
          >{busy === 'run' ? '正在运行…' : '立即运行'}</Button>
        )}
        <Button
          type="button"
          onClick={() => setEditing(true)}
          className="py-1.5 px-3 text-[12px] font-semibold rounded-full bg-cloud text-ink-700 border border-ink-100 active:bg-sky2-50 transition"
        >编辑</Button>
        <Button
          type="button"
          onClick={async () => {
            if (busy) return
            if (!await confirmSensitiveAction({
              title: '删除日历事件？',
              description: `“${event.title || '未命名事件'}”将被永久删除。`,
              confirmLabel: '删除事件',
              tone: 'destructive',
            })) return
            setBusy('delete')
            try {
              await toastAction(removeEvent(event.id), {
                loading: '正在删除事件',
                success: '事件已删除',
                error: '删除事件失败',
              })
              onClose()
            } catch (error) {
              console.warn('delete failed', error)
              setBusy(null)
            }
          }}
          disabled={busy !== null}
          className="py-1.5 px-3 text-[12px] font-semibold rounded-full text-coral-deep border border-coral-soft active:bg-coral-soft/40 transition disabled:opacity-60"
        >删除</Button>
      </div>
      {editing && <EventEditor event={event} onClose={() => setEditing(false)} />}
    </div>
  )
}
