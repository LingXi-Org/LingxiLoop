/**
 * Modal for creating + editing a calendar event. Drives the AI-native
 * "schedule a task for an agent" flow: title + start time + assignee +
 * prompt + recurrence. Reuses the same API as the agent CLI's
 * `lingxiloop calendar create`, so the two stay shape-compatible.
 */
import { useMemo, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { DateTimePicker } from '@/components/DateTimePicker'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toastAction } from '@/lib/actionToast'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import { useMe } from '@/stores/auth'
import { useCalendar } from '../state'
import { useConversations } from '@/features/conversations/store'
import { useParticipants } from '@/features/agents/state'
import type { CalendarEvent, CalendarEventKind, RecurrenceRule } from '../contracts'
import type { Participant } from '@/types'

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

/** Format a JS Date into `YYYY-MM-DDTHH:mm` for `<input type=datetime-local>`. */
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
        className="max-h-[88vh] max-w-[600px] gap-0 overflow-hidden bg-cloud p-0 shadow-pop"
        showCloseButton={!busy}
      >
        <DialogHeader className="shrink-0 border-b border-ink-100 px-6 py-5 pr-14">
          <DialogTitle className="font-display text-[20px] font-medium tracking-tight">
            {isEdit ? "编辑事件" : "新活动"}
          </DialogTitle>
          <DialogDescription className="mt-0.5 font-display text-[12.5px] italic text-ink-500">
            {kind === 'agent_task'
              ? "选择智能体和时间。当它触发时，你的提示会出现在对话中并唤醒他们。"
              : "个人时间标记 — 没有智能体被 ping 到。"}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 overflow-y-auto overflow-x-hidden flex-1 min-h-0 space-y-5">
          <Field label="标题">
            <Input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如每日站立文摘"
              autoFocus
              maxLength={200}
            />
          </Field>

          <Field label="种类" hint="智能体任务触发提示；个人只是一个时间标记。">
            <div className="flex gap-2">
              {(['agent_task', 'personal'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className="px-3 py-1.5 rounded-full text-[12.5px] font-medium transition"
                  style={{
                    background: kind === k ? 'var(--skype)' : 'var(--paper)',
                    color: kind === k ? 'white' : 'var(--ink-700)',
                    border: '1.5px solid ' + (kind === k ? 'var(--skype)' : 'var(--ink-100)'),
                  }}
                >{k === 'agent_task' ? "智能体任务" : "个人"}</button>
              ))}
            </div>
          </Field>

          <Field label="当">
            <label className="flex items-center gap-2 text-[13px] text-ink-700 mb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
              />
              全天
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-1">开始</div>
                <DateTimePicker
                  mode={allDay ? 'date' : 'datetime'}
                  value={startAt}
                  // All-day saves T00:00; otherwise the picker emits its
                  // normal HH:mm. We round-trip through the same value
                  // shape regardless of mode so the submit logic stays put.
                  onChange={(v) => setStartAt(allDay ? `${v.slice(0, 10)}T00:00` : v)}
                />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-1">
                  结束 <span className="normal-case text-ink-300">— 可选</span>
                </div>
                <DateTimePicker
                  mode={allDay ? 'date' : 'datetime'}
                  value={endAt}
                  placeholder="—"
                  allowClear
                  onChange={(v) => {
                    if (!v) { setEndAt(''); return }
                    setEndAt(allDay ? `${v.slice(0, 10)}T23:59` : v)
                  }}
                />
              </div>
            </div>
          </Field>

          <Field label="重复" hint="离开去参加一次性活动。">
            <label className="flex items-center gap-2 text-[13px] text-ink-700 mb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={recurEnabled}
                onChange={(e) => setRecurEnabled(e.target.checked)}
              />
              重复出现
            </label>
            {recurEnabled && (
              <div className="space-y-2 pl-1">
                <div className="flex items-center gap-2">
                  <span className="text-[12.5px] text-ink-500">每</span>
                  <Input
                    type="number"
                    min={1}
                    value={recur.interval}
                    onChange={(e) => setRecur({ ...recur, interval: Math.max(1, Number(e.target.value) || 1) })}
                    style={{ width: 70 }}
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
                        <button
                          type="button"
                          key={idx}
                          onClick={() => {
                            const next = new Set(recur.byweekday ?? [])
                            if (next.has(idx)) next.delete(idx)
                            else next.add(idx)
                            setRecur({ ...recur, byweekday: [...next].sort((a, b) => a - b) })
                          }}
                          className="w-9 h-7 rounded-md text-[11.5px] font-semibold transition"
                          style={{
                            background: on ? 'var(--skype)' : 'var(--paper)',
                            color: on ? 'white' : 'var(--ink-600)',
                            border: '1.5px solid ' + (on ? 'var(--skype)' : 'var(--ink-100)'),
                          }}
                        >{label}</button>
                      )
                    })}
                  </div>
                )}
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="text-[11.5px] text-ink-500 flex items-center gap-1.5">
                    <span>直到</span>
                    <div style={{ width: 180 }}>
                      <DateTimePicker
                        mode="date"
                        value={recur.until ? `${recur.until.slice(0, 10)}T00:00` : ''}
                        allowClear
                        placeholder="从来没有"
                        onChange={(v) => setRecur({
                          ...recur,
                          until: v ? new Date(`${v.slice(0, 10)}T00:00:00`).toISOString() : null,
                        })}
                      />
                    </div>
                  </div>
                  <label className="text-[11.5px] text-ink-500 flex items-center gap-1.5">
                    或最大值
                    <Input
                      type="number"
                      min={1}
                      placeholder="∞"
                      value={recur.count ?? ''}
                      onChange={(e) => setRecur({ ...recur, count: e.target.value ? Math.max(1, Number(e.target.value)) : null })}
                      style={{ width: 80 }}
                    />
                    次
                  </label>
                </div>
              </div>
            )}
          </Field>

          <Field label="提醒" hint="在每次发生之前向您（以及任何人工受让人）发出警告。">
            <label className="flex items-center gap-2 text-[13px] text-ink-700 mb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={reminderEnabled}
                onChange={(e) => setReminderEnabled(e.target.checked)}
              />
              之前提醒我
            </label>
            {reminderEnabled && (
              <div className="space-y-2 pl-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex flex-wrap gap-1">
                    {[5, 10, 15, 30, 60, 120, 1440].map((m) => {
                      const on = reminderMinutes === m
                      const label = m < 60 ? `${m}m` : m < 1440 ? `${m / 60}h` : `${m / 1440}d`
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setReminderMinutes(m)}
                          className="px-2.5 py-1 rounded-full text-[11.5px] font-medium transition"
                          style={{
                            background: on ? 'var(--skype)' : 'var(--paper)',
                            color: on ? 'white' : 'var(--ink-700)',
                            border: '1.5px solid ' + (on ? 'var(--skype)' : 'var(--ink-100)'),
                          }}
                        >{label}</button>
                      )
                    })}
                  </div>
                  <span className="text-[11.5px] text-ink-400">或</span>
                  <Input
                    type="number"
                    min={0}
                    value={reminderMinutes}
                    onChange={(e) => setReminderMinutes(Math.max(0, Number(e.target.value) || 0))}
                    style={{ width: 80 }}
                  />
                  <span className="text-[11.5px] text-ink-500">分钟前</span>
                </div>
                <div className="flex gap-1.5">
                  {(['toast', 'email', 'both'] as const).map((ch) => {
                    const on = reminderChannel === ch
                    return (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => setReminderChannel(ch)}
                        className="px-3 py-1 rounded-full text-[11.5px] font-medium transition"
                        style={{
                          background: on ? 'var(--skype)' : 'var(--paper)',
                          color: on ? 'white' : 'var(--ink-700)',
                          border: '1.5px solid ' + (on ? 'var(--skype)' : 'var(--ink-100)'),
                        }}
                      >{ch === 'toast' ? "吐司" : ch === 'email' ? "电子邮件" : "两者"}</button>
                    )
                  })}
                </div>
              </div>
            )}
          </Field>

          {kind === 'agent_task' && (
            <>
              <Field label="分配给" hint="将接收调度的智能体（或人员）。">
                <div className="grid grid-cols-1 gap-1 max-h-[200px] overflow-auto pr-1">
                  {candidates.map((p) => {
                    const on = assigneeId === p.id
                    return (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => setAssigneeId(p.id)}
                        className="text-left flex items-center gap-3 py-1.5 px-2.5 rounded-[10px] transition"
                        style={{
                          background: on ? 'var(--sky-50)' : 'var(--paper)',
                          border: `1.5px solid ${on ? 'var(--sky2-300)' : 'var(--ink-100)'}`,
                        }}
                      >
                        <Avatar p={p} size={28} ringColor="var(--paper)" showStatus={false} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold text-ink-900 truncate">{p.name}</div>
                          <div className="text-[11px] text-ink-500 truncate">
                            {p.role || (p.kind === 'human' ? 'human' : 'agent')}
                          </div>
                        </div>
                        {on && (
                          <span className="text-[12px] text-skype-deep font-semibold">✓</span>
                        )}
                      </button>
                    )
                  })}
                  {candidates.length === 0 && (
                    <div className="text-[12.5px] text-ink-500 italic font-display py-4 text-center">
                      没有可用的队友 - 首先添加智能体。
                    </div>
                  )}
                </div>
              </Field>

              <Field label="发表于" hint="调度消息触发时到达的位置。留空可与受让人一起使用您的 DM。">
                <Select value={targetConversationId ?? '__direct__'} onValueChange={(value) => setTargetConversationId(value === '__direct__' ? null : value)}>
                  <SelectTrigger className="w-full" aria-label="发布到会话"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__direct__">— 与受让人的直接消息 —</SelectItem>
                    {targetConvos.map((conversation) => <SelectItem key={conversation.id} value={conversation.id}>{conversation.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="提示" hint="智能体每次应该做什么。纯文本——智能体将其视为系统消息。">
                <Textarea
                  value={agentPrompt}
                  onChange={(e) => setAgentPrompt(e.target.value)}
                  placeholder="例如总结过去 24 小时的对话活动并在此处发布摘要。"
                  rows={4}
                  maxLength={8000}
                />
              </Field>
            </>
          )}

          <Field label="隐私" hint="私人事件仅对创建者和受让人显示。工作区所有者仍然可以查看涉及智能体的私人事件以进行监督。默认：与工作区中的每个人共享。">
            <label className="flex items-center gap-2 text-[13px] text-ink-700 cursor-pointer">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
              />
              <span>🔒 私人 — 从共享日历中隐藏</span>
            </label>
          </Field>

          <Field label="注释" hint="可选上下文 - 显示在调度提示旁边。">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="还有什么值得知道的......"
              rows={2}
              maxLength={4000}
            />
          </Field>

          {err && (
            <div className="text-[12.5px] text-coral-deep bg-coral-soft py-2 px-3 rounded-lg">{err}</div>
          )}
        </div>

        <DialogFooter className="shrink-0 flex-row items-center gap-2 border-t border-ink-100 bg-paper px-6 py-4 sm:justify-start">
          {canDelete && (
            <button
              onClick={onDelete}
              disabled={busy}
              className="px-3 py-2 rounded-[9px] text-[12.5px] font-semibold text-coral-deep bg-cloud hover:bg-coral-soft transition"
              style={{ border: '1px solid var(--ink-100)' }}
            >删除</button>
          )}
          {isEdit && event!.kind === 'agent_task' && event!.status === 'active' && (
            <button
              onClick={onRunNow}
              disabled={busy}
              className="px-3 py-2 rounded-[9px] text-[12.5px] font-semibold text-skype-deep bg-cloud hover:bg-sky2-100 transition"
              style={{ border: '1px solid var(--ink-100)' }}
              title="立即触发此事件，无需等待下一个预定时间"
            >立即运行</button>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-[9px] text-[12.5px] font-semibold text-ink-700 bg-cloud hover:bg-sky2-50 transition"
            style={{ border: '1px solid var(--ink-100)' }}
          >取消</button>
          <button
            onClick={submit}
            disabled={busy}
            className="px-5 py-2 rounded-[9px] text-[12.5px] font-semibold text-white transition disabled:opacity-50"
            style={{
              background: 'var(--skype)',
              boxShadow: '0 4px 12px -3px rgba(0, 168, 240, 0.5)',
            }}
          >{busy ? "正在保存..." : isEdit ? "保存" : "时间表"}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-bold tracking-wider uppercase text-ink-500 mb-1">{label}</label>
      {hint && (
        <div className="text-[11.5px] text-ink-300 mb-1.5 font-display italic">{hint}</div>
      )}
      {children}
    </div>
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
