import { Calendar03Icon, Clock01Icon, RepeatIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useRef, useState } from 'react'
import { formatShortDate, PeekHeader, PeekLoading, PeekUnavailable } from '@/components/ArtifactPeekPrimitives'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
    return <PeekLoading icon={<HugeiconsIcon icon={Calendar03Icon} className="size-5" />} label="正在加载日历事件" />
  }

  if (!event) {
    return (
      <PeekUnavailable
        icon={<HugeiconsIcon icon={Calendar03Icon} className="size-5" />}
        title="日历事件不可用"
        detail={failed || '该事件可能已被删除，或不属于当前工作区。'}
        onClose={onClose}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <PeekHeader
        icon={<HugeiconsIcon icon={Calendar03Icon} className="size-5" />}
        label="日历事件"
        title={event.title || '未命名事件'}
        meta={`${event.kind === 'agent_task' ? '智能体任务' : '个人事件'} · ${STATUS_LABEL[event.status]}`}
        onClose={onClose}
        onOpenFull={onOpenFull}
      />
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        <Card>
          <CardContent>
          <div className="flex items-center gap-2 text-sm font-medium">
            <HugeiconsIcon icon={Clock01Icon} className="size-4 text-primary" />
            <span>{formatEventRange(event)}</span>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <HugeiconsIcon icon={RepeatIcon} className="size-3.5" />
            <span>{describeRecurrence(event.recurrence)}</span>
          </div>
          {event.description && (
            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">{event.description}</p>
          )}
          </CardContent>
        </Card>

        <div className="mt-3 grid gap-3">
          {assignee && (
            <Card><CardHeader><CardDescription>执行者</CardDescription></CardHeader><CardContent>
              <div className="flex items-center gap-2">
                <Avatar className="size-6"><AvatarImage src={assignee.avatarUrl ?? undefined} alt="" /><AvatarFallback>{assignee.name.slice(0, 1).toUpperCase()}</AvatarFallback></Avatar>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{assignee.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{assignee.role || assignee.kind}</div>
                </div>
              </div>
            </CardContent></Card>
          )}

          {targetConversation && (
            <Card><CardHeader><CardDescription>目标会话</CardDescription><CardTitle className="truncate text-sm">{targetConversation.title}</CardTitle>
              {targetConversation.subtitle && (
                <CardDescription className="truncate">{targetConversation.subtitle}</CardDescription>
              )}
            </CardHeader></Card>
          )}

          {event.agentPrompt && (
            <Card><CardHeader><CardDescription>任务说明</CardDescription></CardHeader><CardContent><p className="whitespace-pre-wrap text-sm leading-relaxed">{event.agentPrompt}</p></CardContent></Card>
          )}
        </div>
      </div>
      <div
        className="flex shrink-0 items-center gap-2 border-t border-[var(--im-divider-weak)] px-4 py-3"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
      >
        <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
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
            variant="secondary"
            size="sm"
          >{busy === 'run' ? '正在运行…' : '立即运行'}</Button>
        )}
        <Button
          type="button"
          onClick={() => setEditing(true)}
          variant="outline"
          size="sm"
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
          variant="destructive"
          size="sm"
        >删除</Button>
      </div>
      {editing && <EventEditor event={event} onClose={() => setEditing(false)} />}
    </div>
  )
}
