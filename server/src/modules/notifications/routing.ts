import type { NotificationPolicy, NotificationPreferencesRow } from './contracts.js'

export interface NotificationSourceEvent {
  sequence: string
  company_id: string
  project_id: string
  event_type: string
  aggregate_id: string
  recipient_user_id: string
  context_channel_id: string | null
  occurred_at: Date | string
  payload: Record<string, unknown>
}

export interface RoutableIntent {
  id: string
  company_id: string
  project_id: string
  recipient_user_id: string
  source_event_sequence: string
  policy: NotificationPolicy
  summary: string
  link_path: string
  created_at: Date | string
}

export function localClock(timezone: string, now: Date): { date: string; time: string; weekday: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now)
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(value.weekday) + 1
    return {
      date: `${value.year}-${value.month}-${value.day}`,
      time: `${value.hour}:${value.minute}`,
      weekday: weekday || 1,
    }
  } catch {
    const weekday = now.getUTCDay() || 7
    return { date: now.toISOString().slice(0, 10), time: now.toISOString().slice(11, 16), weekday }
  }
}

export function isQuiet(time: string, start: string | null, end: string | null): boolean {
  if (!start || !end || start === end) return false
  const from = start.slice(0, 5)
  const to = end.slice(0, 5)
  return from < to ? time >= from && time < to : time >= from || time < to
}

export function weekStart(date: string, weekday: number): string {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() - (weekday - 1))
  return value.toISOString().slice(0, 10)
}

export function intentPresentation(event: NotificationSourceEvent): {
  category: string
  policy: NotificationPolicy
  summary: string
  linkPath: string
} | null {
  const learningLink = `/learning?projectId=${encodeURIComponent(event.project_id)}`
  switch (event.event_type) {
    case 'ASSESSMENT.ATTEMPT_SUBMITTED':
      return { category: 'ASSESSMENT', policy: 'DAILY', summary: '学习提交已记录', linkPath: learningLink }
    case 'LEARNING_CASE.DETECTED':
      return { category: 'ATTENTION', policy: 'IMMEDIATE', summary: '有新的学习事项需要关注', linkPath: learningLink }
    case 'LEARNING_CASE.ACTION_APPLIED': {
      const kind = event.payload.kind
      if (kind === 'INTERVENE') {
        return { category: 'INTERVENTION', policy: 'IMMEDIATE', summary: '学习支持方案已更新', linkPath: learningLink }
      }
      if (kind === 'REASSESS') {
        return { category: 'REASSESSMENT', policy: 'IMMEDIATE', summary: '复评安排已更新', linkPath: learningLink }
      }
      if (kind === 'ESCALATE' || kind === 'OVERRIDE') {
        return { category: 'LEARNING', policy: 'FORMAL', summary: '学习事项有正式更新', linkPath: learningLink }
      }
      return { category: 'LEARNING', policy: 'DAILY', summary: '学习事项已更新', linkPath: learningLink }
    }
    case 'ContextThreadCreated':
      return event.context_channel_id
        ? { category: 'COMMUNICATION', policy: 'IMMEDIATE', summary: '新的协作会话已创建',
            linkPath: `/conversations/${encodeURIComponent(event.context_channel_id)}` }
        : null
    default:
      return null
  }
}

export function routingWindow(
  intent: RoutableIntent,
  preference: NotificationPreferencesRow,
  now: Date,
): string | null {
  const clock = localClock(preference.timezone, now)
  if (isQuiet(clock.time, preference.quiet_start, preference.quiet_end)) return null
  if (intent.policy === 'IMMEDIATE' || intent.policy === 'FORMAL') {
    return `${intent.policy.toLowerCase()}:${intent.source_event_sequence}`
  }
  if (clock.time < preference.daily_time.slice(0, 5)) return null
  const created = localClock(preference.timezone, new Date(intent.created_at))
  if (intent.policy === 'DAILY') {
    if (created.date === clock.date && created.time > preference.daily_time.slice(0, 5)) return null
    return `daily:${clock.date}`
  }
  if (clock.weekday < preference.weekly_day) return null
  const currentWeek = weekStart(clock.date, clock.weekday)
  const createdAfterCutoff = weekStart(created.date, created.weekday) === currentWeek
    && (created.weekday > preference.weekly_day
      || (created.weekday === preference.weekly_day && created.time > preference.daily_time.slice(0, 5)))
  return createdAfterCutoff ? null : `weekly:${currentWeek}`
}
