/**
 * Modal for creating + editing a calendar event. Drives the AI-native
 * "schedule a task for an agent" flow: title + start time + assignee +
 * prompt + recurrence. Reuses the same API as the agent CLI's
 * `lingxiloop calendar create`, so the two stay shape-compatible.
 */

import { LockIcon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMemo, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useParticipants } from '@/features/agents/state'
import { useConversations } from '@/features/conversations/store'
import { toastAction } from '@/lib/actionToast'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import { useMe } from '@/stores/auth'
import type { Participant } from '@/types'
import type { CalendarEvent, CalendarEventKind, RecurrenceRule } from '../contracts'
import { useCalendar } from '../state'

/** Prefilled defaults passed in when creating a NEW event from a calendar
 *  drag-select or right-click. Ignored when `event` is supplied (edit
 *  mode). The Calendar UI uses this for: drag a time range in week view →
 *  prefill startAt + endAt; right-click an empty slot → prefill startAt at
 *  the clicked time; drag across days in month view → prefill an all-day
 *  multi-day range. */
export interface EventEditorPrefill {
  startAt: Date
  endAt?: Date | null
  allDay?: boolean
}

interface Props {
  event: CalendarEvent | null
  prefill?: EventEditorPrefill | null
  onClose: () => void
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Format a JS Date into the local date-time control value. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Inverse of toLocalInput — parse the input value as local time and produce
 *  an ISO timestamp the server accepts. */
function fromLocalInput(s: string): string {
  // new Date('YYYY-MM-DDTHH:mm') interprets as local time, which is what
  // we want — toISOString() then converts to UTC for the wire.
  return new Date(s).toISOString()
}

export function EventEditor({ event, prefill, onClose }: Props) {
  const create = useCalendar((s) => s.create)
  const update = useCalendar((s) => s.update)
  const remove = useCalendar((s) => s.remove)
  const runNow = useCalendar((s) => s.runNow)
  const byId = useParticipants((s) => s.byId)
  const conversations = useConversations((s) => s.list)
  const meId = useMe()

  const isEdit = !!event

  const [title, setTitle] = useState(event?.title ?? '')
  const [description, setDescription] = useState(event?.description ?? '')
  const [kind, setKind] = useState<CalendarEventKind>(event?.kind ?? 'agent_task')
  const [startAt, setStartAt] = useState(() =>
    event ? toLocalInput(new Date(event.startAt))
    : prefill ? toLocalInput(prefill.startAt)
    : toLocalInput(roundUpToNext15(new Date())),
  )
  const [endAt, setEndAt] = useState(() =>
    event?.endAt ? toLocalInput(new Date(event.endAt))
    : prefill?.endAt ? toLocalInput(prefill.endAt)
    : '',
  )
  const [allDay, setAllDay] = useState<boolean>(event?.allDay ?? prefill?.allDay ?? false)
  const [assigneeId, setAssigneeId] = useState<string | null>(event?.assigneeId ?? null)
  const [targetConversationId, setTargetConversationId] = useState<string | null>(event?.targetConversationId ?? null)
  const [agentPrompt, setAgentPrompt] = useState(event?.agentPrompt ?? '')
  const [recurEnabled, setRecurEnabled] = useState(!!event?.recurrence)
  const [recur, setRecur] = useState<RecurrenceRule>(
    event?.recurrence ?? { freq: 'weekly', interval: 1 },
  )
  // Reminder: enabled when either column is set on the event row. We pre-
  // seed with a sensible default (10 min · toast) so toggling on doesn't
  // require the user to think.
  const [reminderEnabled, setReminderEnabled] = useState(
    event?.reminderMinutesBefore != null && !!event?.reminderChannel,
  )
  const [reminderMinutes, setReminderMinutes] = useState<number>(event?.reminderMinutesBefore ?? 10)
  const [reminderChannel, setReminderChannel] = useState<'toast' | 'email' | 'both'>(
    event?.reminderChannel ?? 'toast',
  )
  // Privacy toggle. Defaults to whatever the row already is; new events
  // start public to match the existing "shared workspace calendar" default.
  const [isPrivate, setIsPrivate] = useState<boolean>(event?.isPrivate ?? false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Assignee picker source: every active participant (agents preferred at
  // top — that's the primary use case — but humans are valid too for
  // "remind teammate" personal events).
  const candidates: Participant[] = useMemo(() => {
    return Object.values(byId)
      .filter((p) => !p.departedAt && !p.managed)
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'agent' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
  }, [byId])

  // Conversations the assignee belongs to — these are the valid drop
  // targets for an agent_task. Fall back to "any conversation in the
  // workspace" if no assignee is picked yet.
  const targetConvos = useMemo(() => {
    if (!assigneeId) return conversations
    return conversations.filter((c) => c.members.includes(assigneeId))
  }, [conversations, assigneeId])

  const submit = async () => {
    setErr(null)
    const cleanTitle = title.trim()
    if (!cleanTitle) { setErr('title is required'); return }
    if (kind === 'agent_task' && !assigneeId) { setErr('pick an assignee for the agent task'); return }
    if (!startAt) { setErr('start time is required'); return }

    const recurrence: RecurrenceRule | null = recurEnabled
      ? {
          freq: recur.freq,
          interval: Math.max(1, Math.floor(recur.interval || 1)),
          byweekday: recur.freq === 'weekly' ? recur.byweekday : undefined,
          until: recur.until ? new Date(recur.until).toISOString() : null,
          count: recur.count ?? null,
        }
      : null

    setBusy(true)
    try {
      const payload = {
        title: cleanTitle,
        kind,
        description: description.trim() || null,
        assigneeId: kind === 'agent_task' ? assigneeId : null,
        targetConversationId: kind === 'agent_task' ? targetConversationId : null,
        agentPrompt: kind === 'agent_task' ? (agentPrompt.trim() || null) : null,
        startAt: fromLocalInput(startAt),
        endAt: endAt ? fromLocalInput(endAt) : null,
        allDay,
        recurrence,
        reminderMinutesBefore: reminderEnabled ? Math.max(0, Math.floor(reminderMinutes)) : null,
        reminderChannel: reminderEnabled ? reminderChannel : null,
        isPrivate,
      }
      if (event) {
        await toastAction(update(event.id, payload), {
          loading: '正在更新事件',
          success: '事件已更新',
          error: '更新事件失败',
        })
      } else {
        await toastAction(create(payload), {
          loading: '正在创建事件',
          success: payload.kind === 'agent_task' ? '任务事件已创建' : '事件已创建',
          error: '创建事件失败',
        })
      }
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const onDelete = async () => {
    if (!event) return
    if (!await confirmSensitiveAction({
      title: '删除事件及运行记录？',
      description: `“${event.title}”及其全部任务运行记录都将永久删除。`,
      confirmLabel: '删除事件',
      tone: 'destructive',
    })) return
    setBusy(true)
    try {
      await toastAction(remove(event.id), { loading: '正在删除事件', success: '事件已删除', error: '删除事件失败' })
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const onRunNow = async () => {
    if (!event) return
    setBusy(true)
    try {
      const r = await toastAction(runNow(event.id), {
        loading: '正在运行任务',
        success: '任务已触发',
        error: '任务触发失败',
        description: event.title,
      })
      if (r.status === 'dispatched') onClose()
      else setErr(`run-now: ${r.status}${r.error ? ` — ${r.error}` : ''}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const canDelete = event && event.createdBy === meId

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose() }}>
      <DialogContent
        className="max-h-[88vh] max-w-[600px] gap-0 overflow-hidden bg-card p-0"
        showCloseButton={!busy}
      >
        <DialogHeader className="shrink-0 border-b border-[var(--im-divider-weak)] px-6 py-5 pe-14">
          <DialogTitle>
            {isEdit ? "编辑事件" : "新活动"}
          </DialogTitle>
          <DialogDescription>
            {kind === 'agent_task'
              ? "选择智能体和时间。当它触发时，你的提示会出现在对话中并唤醒他们。"
              : "个人时间标记 — 没有智能体被 ping 到。"}
          </DialogDescription>
        </DialogHeader>

        <FieldGroup className="min-h-0 flex-1 gap-5 overflow-x-hidden overflow-y-auto px-6 py-5">
          <Field>
            <FieldLabel htmlFor="event-title">标题</FieldLabel>
            <Input
              id="event-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如每日站立文摘"
              autoFocus
              maxLength={200}
            />
          </Field>

          <Field>
            <FieldLabel>种类</FieldLabel>
            <FieldDescription>智能体任务触发提示；个人只是一个时间标记。</FieldDescription>
            <div className="flex gap-2">
              {(['agent_task', 'personal'] as const).map((k) => (
                <Button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  variant={kind === k ? 'secondary' : 'outline'}
                  size="sm"
                >{k === 'agent_task' ? "智能体任务" : "个人"}</Button>
              ))}
            </div>
          </Field>

          <Field>
            <FieldLabel>时间</FieldLabel>
            <FieldLabel className="w-fit font-normal">
              <Checkbox
                checked={allDay}
                onCheckedChange={(checked) => setAllDay(checked === true)}
              />
              全天
            </FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <FieldLabel htmlFor="event-start" className="mb-1 text-xs text-muted-foreground">开始</FieldLabel>
                <Input
                  id="event-start"
                  type={allDay ? 'date' : 'datetime-local'}
                  value={allDay ? startAt.slice(0, 10) : startAt}
                  // All-day saves T00:00; otherwise the picker emits its
                  // normal HH:mm. We round-trip through the same value
                  // shape regardless of mode so the submit logic stays put.
                  onChange={(event) => setStartAt(allDay ? `${event.target.value.slice(0, 10)}T00:00` : event.target.value)}
                />
              </div>
              <div>
                <FieldLabel htmlFor="event-end" className="mb-1 text-xs text-muted-foreground">结束 — 可选</FieldLabel>
                <Input
                  id="event-end"
                  type={allDay ? 'date' : 'datetime-local'}
                  value={allDay && endAt ? endAt.slice(0, 10) : endAt}
                  placeholder="—"
                  onChange={(event) => {
                    if (!event.target.value) { setEndAt(''); return }
                    setEndAt(allDay ? `${event.target.value.slice(0, 10)}T23:59` : event.target.value)
                  }}
                />
              </div>
            </div>
          </Field>

          <Field>
            <FieldLabel>重复</FieldLabel>
            <FieldDescription>关闭即可创建一次性活动。</FieldDescription>
            <FieldLabel className="w-fit font-normal">
              <Checkbox
                checked={recurEnabled}
                onCheckedChange={(checked) => setRecurEnabled(checked === true)}
              />
              重复出现
            </FieldLabel>
            {recurEnabled && (
              <div className="space-y-2 pl-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">每</span>
                  <Input
                    type="number"
                    min={1}
                    value={recur.interval}
                    onChange={(e) => setRecur({ ...recur, interval: Math.max(1, Number(e.target.value) || 1) })}
                    className="w-[70px]"
                  />
                  <Select value={recur.freq} onValueChange={(value) => setRecur({ ...recur, freq: value as RecurrenceRule['freq'] })}>
                    <SelectTrigger className="w-28" aria-label="重复频率"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">日{recur.interval > 1 ? 's' : ''}</SelectItem>
                      <SelectItem value="weekly">周{recur.interval > 1 ? 's' : ''}</SelectItem>
                      <SelectItem value="monthly">月{recur.interval > 1 ? 's' : ''}</SelectItem>
                      <SelectItem value="yearly">年{recur.interval > 1 ? 's' : ''}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {recur.freq === 'weekly' && (
                  <div className="flex flex-wrap gap-1">
                    {WEEKDAY_LABELS.map((label, idx) => {
                      const on = (recur.byweekday ?? []).includes(idx)
                      return (
                        <Button
                          type="button"
                          key={idx}
                          onClick={() => {
                            const next = new Set(recur.byweekday ?? [])
                            if (next.has(idx)) next.delete(idx)
                            else next.add(idx)
                            setRecur({ ...recur, byweekday: [...next].sort((a, b) => a - b) })
                          }}
                          variant={on ? 'secondary' : 'outline'}
                          size="sm"
                          className="h-7 w-9 px-0 text-xs"
                        >{label}</Button>
                      )
                    })}
                  </div>
                )}
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>直到</span>
                    <div className="w-[180px]">
                      <Input
                        type="date"
                        value={recur.until ? recur.until.slice(0, 10) : ''}
                        placeholder="从来没有"
                        onChange={(event) => setRecur({
                          ...recur,
                          until: event.target.value ? new Date(`${event.target.value.slice(0, 10)}T00:00:00`).toISOString() : null,
                        })}
                      />
                    </div>
                  </div>
                  <FieldLabel className="flex w-fit items-center gap-1.5 text-xs font-normal text-muted-foreground">
                    或最大值
                    <Input
                      type="number"
                      min={1}
                      placeholder="∞"
                      value={recur.count ?? ''}
                      onChange={(e) => setRecur({ ...recur, count: e.target.value ? Math.max(1, Number(e.target.value)) : null })}
                      className="w-20"
                    />
                    次
                  </FieldLabel>
                </div>
              </div>
            )}
          </Field>

          <Field>
            <FieldLabel>提醒</FieldLabel>
            <FieldDescription>在每次发生之前向你和人工受让人发出提醒。</FieldDescription>
            <FieldLabel className="w-fit font-normal">
              <Checkbox
                checked={reminderEnabled}
                onCheckedChange={(checked) => setReminderEnabled(checked === true)}
              />
              之前提醒我
            </FieldLabel>
            {reminderEnabled && (
              <div className="space-y-2 pl-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex flex-wrap gap-1">
                    {[5, 10, 15, 30, 60, 120, 1440].map((m) => {
                      const on = reminderMinutes === m
                      const label = m < 60 ? `${m}m` : m < 1440 ? `${m / 60}h` : `${m / 1440}d`
                      return (
                        <Button
                          key={m}
                          type="button"
                          onClick={() => setReminderMinutes(m)}
                          variant={on ? 'secondary' : 'outline'}
                          size="sm"
                          className="h-7 px-2.5 text-xs"
                        >{label}</Button>
                      )
                    })}
                  </div>
                  <span className="text-xs text-muted-foreground">或</span>
                  <Input
                    type="number"
                    min={0}
                    value={reminderMinutes}
                    onChange={(e) => setReminderMinutes(Math.max(0, Number(e.target.value) || 0))}
                    className="w-20"
                  />
                  <span className="text-xs text-muted-foreground">分钟前</span>
                </div>
                <div className="flex gap-1.5">
                  {(['toast', 'email', 'both'] as const).map((ch) => {
                    const on = reminderChannel === ch
                    return (
                      <Button
                        key={ch}
                        type="button"
                        onClick={() => setReminderChannel(ch)}
                        variant={on ? 'secondary' : 'outline'}
                        size="sm"
                        className="h-7 px-3 text-xs"
                      >{ch === 'toast' ? "吐司" : ch === 'email' ? "电子邮件" : "两者"}</Button>
                    )
                  })}
                </div>
              </div>
            )}
          </Field>

          {kind === 'agent_task' && (
            <>
              <Field>
                <FieldLabel>分配给</FieldLabel>
                <FieldDescription>选择接收调度的智能体或人员。</FieldDescription>
                <div className="grid grid-cols-1 gap-1 max-h-[200px] overflow-auto pr-1">
                  {candidates.map((p) => {
                    const on = assigneeId === p.id
                    return (
                      <Button
                        type="button"
                        key={p.id}
                        onClick={() => setAssigneeId(p.id)}
                        variant={on ? 'secondary' : 'ghost'}
                        className="h-auto justify-start gap-3 px-2.5 py-1.5 text-start"
                      >
                        <Avatar className="size-7">
                          <AvatarImage src={p.avatarUrl ?? undefined} alt="" />
                          <AvatarFallback>{p.name.slice(0, 1).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-sm font-medium">{p.name}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {p.role || (p.kind === 'human' ? 'human' : 'agent')}
                          </div>
                        </div>
                        {on && (
                          <HugeiconsIcon icon={Tick02Icon} className="size-4 text-primary" />
                        )}
                      </Button>
                    )
                  })}
                  {candidates.length === 0 && (
                    <div className="py-4 text-center text-sm text-muted-foreground">
                      没有可用的队友 - 首先添加智能体。
                    </div>
                  )}
                </div>
              </Field>

              <Field>
                <FieldLabel>发布到</FieldLabel>
                <FieldDescription>调度消息触发时到达的位置；留空时使用与受让人的私聊。</FieldDescription>
                <Select value={targetConversationId ?? '__direct__'} onValueChange={(value) => setTargetConversationId(value === '__direct__' ? null : value)}>
                  <SelectTrigger className="w-full" aria-label="发布到会话"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__direct__">— 与受让人的直接消息 —</SelectItem>
                    {targetConvos.map((conversation) => <SelectItem key={conversation.id} value={conversation.id}>{conversation.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel htmlFor="event-prompt">提示</FieldLabel>
                <FieldDescription>智能体每次应该完成的任务，内容会作为系统消息发送。</FieldDescription>
                <Textarea
                  id="event-prompt"
                  value={agentPrompt}
                  onChange={(e) => setAgentPrompt(e.target.value)}
                  placeholder="例如总结过去 24 小时的对话活动并在此处发布摘要。"
                  rows={4}
                  maxLength={8000}
                />
              </Field>
            </>
          )}

          <Field>
            <FieldLabel>隐私</FieldLabel>
            <FieldDescription>私人事件仅对创建者和受让人显示；工作区所有者仍可监督涉及智能体的事件。</FieldDescription>
            <FieldLabel className="w-fit font-normal">
              <Checkbox
                checked={isPrivate}
                onCheckedChange={(checked) => setIsPrivate(checked === true)}
              />
              <HugeiconsIcon icon={LockIcon} className="size-4" />
              <span>私人 — 从共享日历中隐藏</span>
            </FieldLabel>
          </Field>

          <Field>
            <FieldLabel htmlFor="event-description">注释</FieldLabel>
            <FieldDescription>可选上下文，会显示在调度提示旁边。</FieldDescription>
            <Textarea
              id="event-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="还有什么值得知道的......"
              rows={2}
              maxLength={4000}
            />
          </Field>

          {err && (
            <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>
          )}
        </FieldGroup>

        <DialogFooter className="shrink-0 flex-row items-center gap-2 border-t border-[var(--im-divider-weak)] bg-card px-6 py-4 sm:justify-start">
          {canDelete && (
            <Button
              onClick={onDelete}
              disabled={busy}
              variant="destructive"
            >删除</Button>
          )}
          {isEdit && event!.kind === 'agent_task' && event!.status === 'active' && (
            <Button
              onClick={onRunNow}
              disabled={busy}
              variant="secondary"
              title="立即触发此事件，无需等待下一个预定时间"
            >立即运行</Button>
          )}
          <div className="flex-1" />
          <Button
            onClick={onClose}
            disabled={busy}
            variant="outline"
          >取消</Button>
          <Button
            onClick={submit}
            disabled={busy}
          >{busy ? "正在保存..." : isEdit ? "保存" : "时间表"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Round a Date forward to the next quarter-hour so the default "new event"
 *  start time isn't an awkward 14:37. */
function roundUpToNext15(d: Date): Date {
  const out = new Date(d)
  out.setSeconds(0, 0)
  const m = out.getMinutes()
  const add = (15 - (m % 15)) % 15
  out.setMinutes(m + (add === 0 ? 15 : add))
  return out
}
