import { randomUUID } from 'node:crypto'
import { pool } from '../db/pool.js'
import { env } from '../env.js'
import { formatAddress, mintMessageId, sendViaProvider } from '../email.js'
import { inc } from '../metrics.js'
import { sendToUsers } from '../push.js'
import { getNotificationPreferences } from './service.js'

type DigestKind = 'review_due' | 'grading_queue'
type DeliveryChannel = 'in_app' | 'push' | 'email'

interface DigestCandidate { user_id: string; course_id: string; course_title: string; kind: DigestKind; item_count: number }

function localClock(timezone: string): { date: string; time: string } {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date())
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    return { date: `${value.year}-${value.month}-${value.day}`, time: `${value.hour}:${value.minute}` }
  } catch { return { date: new Date().toISOString().slice(0, 10), time: new Date().toISOString().slice(11, 16) } }
}

function isQuiet(time: string, start: string | null, end: string | null): boolean {
  if (!start || !end || start === end) return false
  const a = start.slice(0, 5); const b = end.slice(0, 5)
  return a < b ? time >= a && time < b : time >= a || time < b
}

async function candidates(): Promise<DigestCandidate[]> {
  const { rows } = await pool.query<DigestCandidate>(
    `WITH learner AS (
       SELECT m.learner_id AS user_id,m.course_id,c.title AS course_title,'review_due'::text AS kind,COUNT(*)::int AS item_count
         FROM learning_mastery m JOIN learning_courses c ON c.id=m.course_id
        WHERE c.status='active' AND m.next_review_at<=NOW() GROUP BY m.learner_id,m.course_id,c.title
     ), teacher AS (
       SELECT cm.user_id,a.course_id,c.title AS course_title,'grading_queue'::text AS kind,COUNT(*)::int AS item_count
         FROM learning_evaluations e JOIN learning_attempts a ON a.id=e.attempt_id
         JOIN learning_courses c ON c.id=a.course_id
         JOIN learning_course_memberships cm ON cm.course_id=a.course_id AND cm.role='teacher'
        WHERE c.status='active' AND e.status='pending' GROUP BY cm.user_id,a.course_id,c.title
     ) SELECT * FROM learner UNION ALL SELECT * FROM teacher`,
  )
  return rows
}

async function prepareDeliveries(): Promise<void> {
  for (const candidate of await candidates()) {
    const pref = await getNotificationPreferences(candidate.user_id, candidate.course_id) as Record<string, unknown>
    const timezone = String(pref.timezone ?? 'Asia/Shanghai')
    const clock = localClock(timezone)
    const preferred = String(pref.preferred_time ?? '19:00').slice(0, 5)
    if (clock.time < preferred || isQuiet(clock.time, pref.quiet_start ? String(pref.quiet_start) : null, pref.quiet_end ? String(pref.quiet_end) : null)) continue
    if (candidate.kind === 'review_due') inc('learning.review.due')
    const channels: DeliveryChannel[] = [
      ...(pref.in_app_enabled !== false ? ['in_app' as const] : []),
      ...(pref.push_enabled === true ? ['push' as const] : []),
      ...(pref.email_enabled === true ? ['email' as const] : []),
    ]
    for (const channel of channels) {
      await pool.query(
        `INSERT INTO learning_notification_deliveries(id,user_id,course_id,channel,kind,digest_date,status)
         VALUES($1,$2,$3,$4,$5,$6,'pending')
         ON CONFLICT(user_id,course_id,channel,kind,digest_date) WHERE course_id IS NOT NULL DO NOTHING`,
        [randomUUID(), candidate.user_id, candidate.course_id, channel, candidate.kind, clock.date],
      )
    }
  }
}

async function deliverPending(): Promise<void> {
  const { rows } = await pool.query<{
    id:string;user_id:string;course_id:string;channel:DeliveryChannel;kind:DigestKind;status:'pending'|'failed';attempts:number;course_title:string;email:string|null;display_name:string|null;item_count:number
  }>(
    `SELECT d.id,d.user_id,d.course_id,d.channel,d.kind,d.status,d.attempts,c.title AS course_title,u.email,u.display_name,
            CASE WHEN d.kind='review_due' THEN (SELECT COUNT(*)::int FROM learning_mastery m WHERE m.course_id=d.course_id AND m.learner_id=d.user_id AND m.next_review_at<=NOW())
                 ELSE (SELECT COUNT(*)::int FROM learning_evaluations e JOIN learning_attempts a ON a.id=e.attempt_id WHERE a.course_id=d.course_id AND e.status='pending') END AS item_count
       FROM learning_notification_deliveries d JOIN learning_courses c ON c.id=d.course_id JOIN users u ON u.id=d.user_id
      WHERE d.status IN ('pending','failed') AND d.attempts<5
        AND d.updated_at <= NOW() - (LEAST(60,POWER(2,d.attempts))::int * INTERVAL '1 minute')
      ORDER BY d.created_at FOR UPDATE SKIP LOCKED LIMIT 100`,
  )
  for (const row of rows) {
    const claim = await pool.query(
      `UPDATE learning_notification_deliveries SET attempts=attempts+1,updated_at=NOW()
        WHERE id=$1 AND attempts=$2 AND status=$3 RETURNING id`, [row.id, row.attempts, row.status],
    )
    if (!claim.rows[0]) continue
    try {
      const title = row.kind === 'review_due' ? '今日学习复习摘要' : '今日评价审核摘要'
      const body = row.kind === 'review_due'
        ? `${row.course_title} 有 ${row.item_count} 个目标到期复习。`
        : `${row.course_title} 有 ${row.item_count} 项评价等待审核。`
      if (row.channel === 'push') {
        const delivered = await sendToUsers([row.user_id], { title, body, threadId: `learning:${row.course_id}`, data: { view: 'learning', courseId: row.course_id } })
        if (delivered < 1) throw new Error('no active push device or push provider unavailable')
      }
      if (row.channel === 'email') {
        if (!env.EMAIL_DOMAIN || !row.email) throw new Error('email delivery is not configured for this user')
        const result = await sendViaProvider({ from: formatAddress(`learning@${env.EMAIL_DOMAIN}`, 'LingxiLoop Learning'), to: [row.email], subject: title,
          text: `${row.display_name ? `${row.display_name}，` : ''}${body}\n\n打开 LingxiLoop 学习中心查看。`, messageId: mintMessageId(),
          idempotencyKey: `learning:${row.id}`, autoSubmitted: 'auto-generated' })
        if (!result.ok) throw new Error(result.error ?? 'email provider rejected digest')
      }
      await pool.query(`UPDATE learning_notification_deliveries SET status='sent',sent_at=NOW(),error=NULL,updated_at=NOW() WHERE id=$1`, [row.id])
      inc('learning.notification.delivered', { channel: row.channel, status: 'sent' })
    } catch (error) {
      await pool.query(`UPDATE learning_notification_deliveries SET status='failed',error=$2,updated_at=NOW() WHERE id=$1`, [row.id, error instanceof Error ? error.message : String(error)])
      inc('learning.notification.delivered', { channel: row.channel, status: 'failed' })
    }
  }
}

export async function runLearningNotificationSweep(): Promise<void> {
  await prepareDeliveries()
  await deliverPending()
}

export function startLearningNotificationScheduler(intervalMs = Number(process.env.LEARNING_NOTIFICATION_INTERVAL_MS ?? 60_000)): () => void {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return () => undefined
  const tick = () => void runLearningNotificationSweep().catch((error) => console.warn('[learning] notification sweep failed:', error instanceof Error ? error.message : String(error)))
  tick()
  const timer = setInterval(tick, Math.max(10_000, intervalMs)); timer.unref?.()
  return () => clearInterval(timer)
}
