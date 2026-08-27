import { randomUUID } from 'node:crypto'
import { pool } from '../db/pool.js'
import { env } from '../env.js'
import { formatAddress, mintMessageId, sendViaProvider } from '../email.js'
import { inc } from '../metrics.js'
import type { WorkerTaskHandle } from '../runtime/lifecycle.js'
import { getNotificationPreferences } from './service.js'

type DigestKind = 'review_due' | 'grading_queue'
type DeliveryChannel = 'in_app' | 'email'

interface DigestCandidate {
  company_id: string
  user_id: string
  course_id: string
  course_title: string
  kind: DigestKind
  item_count: number
}

function localClock(timezone: string, now: Date): { date: string; time: string } {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now)
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    return { date: `${value.year}-${value.month}-${value.day}`, time: `${value.hour}:${value.minute}` }
  } catch {
    return { date: now.toISOString().slice(0, 10), time: now.toISOString().slice(11, 16) }
  }
}

function isQuiet(time: string, start: string | null, end: string | null): boolean {
  if (!start || !end || start === end) return false
  const a = start.slice(0, 5)
  const b = end.slice(0, 5)
  return a < b ? time >= a && time < b : time >= a || time < b
}

async function candidates(now: Date): Promise<DigestCandidate[]> {
  const { rows } = await pool.query<DigestCandidate>(
    `WITH learner AS (
       SELECT course.company_id,mastery.learner_id AS user_id,mastery.course_id,
              project.name AS course_title,'review_due'::text AS kind,COUNT(*)::int AS item_count
         FROM learning_mastery mastery
         JOIN courses course ON course.id=mastery.course_id AND course.company_id=mastery.company_id
         JOIN projects project ON project.id=course.project_id AND project.company_id=course.company_id
         JOIN course_members member
           ON member.course_id=course.id AND member.company_id=course.company_id
          AND member.user_id=mastery.learner_id AND member.role='learner'
        WHERE project.status='active' AND mastery.next_review_at<=$1
        GROUP BY course.company_id,mastery.learner_id,mastery.course_id,project.name
     ), teacher AS (
       SELECT course.company_id,member.user_id,attempt.course_id,project.name AS course_title,
              'grading_queue'::text AS kind,COUNT(*)::int AS item_count
         FROM learning_evaluations evaluation
         JOIN learning_attempts attempt ON attempt.id=evaluation.attempt_id
         JOIN courses course ON course.id=attempt.course_id AND course.company_id=attempt.company_id
         JOIN projects project ON project.id=course.project_id AND project.company_id=course.company_id
         JOIN course_members member
           ON member.course_id=course.id AND member.company_id=course.company_id AND member.role='teacher'
        WHERE project.status='active' AND evaluation.status='pending'
        GROUP BY course.company_id,member.user_id,attempt.course_id,project.name
     ) SELECT * FROM learner UNION ALL SELECT * FROM teacher`,
    [now],
  )
  return rows
}

async function prepareDeliveries(now: Date): Promise<void> {
  for (const candidate of await candidates(now)) {
    const pref = await getNotificationPreferences(
      candidate.company_id,
      candidate.user_id,
      candidate.course_id,
    ) as Record<string, unknown>
    const timezone = String(pref.timezone ?? 'Asia/Shanghai')
    const clock = localClock(timezone, now)
    const preferred = String(pref.preferred_time ?? '19:00').slice(0, 5)
    if (
      clock.time < preferred
      || isQuiet(
        clock.time,
        pref.quiet_start ? String(pref.quiet_start) : null,
        pref.quiet_end ? String(pref.quiet_end) : null,
      )
    ) continue
    if (candidate.kind === 'review_due') inc('learning.review.due')
    const channels: DeliveryChannel[] = [
      ...(pref.in_app_enabled !== false ? ['in_app' as const] : []),
      ...(pref.email_enabled === true ? ['email' as const] : []),
    ]
    for (const channel of channels) {
      await pool.query(
        `INSERT INTO learning_notification_deliveries
           (id,company_id,user_id,course_id,channel,kind,digest_date,status,available_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,'pending',$8)
         ON CONFLICT(company_id,user_id,course_id,channel,kind,digest_date)
           WHERE course_id IS NOT NULL DO NOTHING`,
        [randomUUID(), candidate.company_id, candidate.user_id, candidate.course_id,
          channel, candidate.kind, clock.date, now],
      )
    }
  }
}

async function deliverPending(now: Date): Promise<void> {
  const leaseToken = randomUUID()
  const { rows } = await pool.query<{
    id: string; company_id: string; user_id: string; course_id: string
    channel: DeliveryChannel; kind: DigestKind; attempts: number
    course_title: string; email: string | null; display_name: string | null; item_count: number
  }>(
    `WITH claimable AS (
       SELECT delivery.id
         FROM learning_notification_deliveries delivery
        WHERE delivery.attempts<5
          AND (
            (delivery.status IN ('pending','failed') AND delivery.available_at<=$1)
            OR (delivery.status='sending' AND delivery.lease_expires_at<=$1)
          )
        ORDER BY delivery.available_at,delivery.created_at
        FOR UPDATE SKIP LOCKED LIMIT 100
     ), claimed AS (
       UPDATE learning_notification_deliveries delivery
          SET status='sending',attempts=delivery.attempts+1,lease_token=$2,
              lease_expires_at=$1+INTERVAL '5 minutes',updated_at=$1
         FROM claimable
        WHERE delivery.id=claimable.id
        RETURNING delivery.*
     )
     SELECT claimed.id,claimed.company_id,claimed.user_id,claimed.course_id,
            claimed.channel,claimed.kind,claimed.attempts,project.name AS course_title,
            users.email,users.display_name,
            CASE WHEN claimed.kind='review_due' THEN (
              SELECT COUNT(*)::int FROM learning_mastery mastery
               WHERE mastery.course_id=claimed.course_id AND mastery.learner_id=claimed.user_id
                 AND mastery.next_review_at<=$1
            ) ELSE (
              SELECT COUNT(*)::int FROM learning_evaluations evaluation
              JOIN learning_attempts attempt ON attempt.id=evaluation.attempt_id
               WHERE attempt.course_id=claimed.course_id AND evaluation.status='pending'
            ) END AS item_count
       FROM claimed
       JOIN courses course ON course.id=claimed.course_id AND course.company_id=claimed.company_id
       JOIN projects project ON project.id=course.project_id AND project.company_id=course.company_id
       JOIN users ON users.id=claimed.user_id`,
    [now, leaseToken],
  )

  for (const row of rows) {
    try {
      const title = row.kind === 'review_due' ? '今日学习复习摘要' : '今日评价审核摘要'
      const body = row.kind === 'review_due'
        ? `${row.course_title} 有 ${row.item_count} 个目标到期复习。`
        : `${row.course_title} 有 ${row.item_count} 项评价等待审核。`
      if (row.channel === 'email') {
        if (!env.EMAIL_DOMAIN || !row.email) throw new Error('email delivery is not configured for this user')
        const result = await sendViaProvider({
          from: formatAddress(`learning@${env.EMAIL_DOMAIN}`, 'LingxiLoop Learning'),
          to: [row.email],
          subject: title,
          text: `${row.display_name ? `${row.display_name}，` : ''}${body}\n\n打开 LingxiLoop 学习中心查看。`,
          messageId: mintMessageId(),
          idempotencyKey: `learning:${row.id}`,
          autoSubmitted: 'auto-generated',
        })
        if (!result.ok) throw new Error(result.error ?? 'email provider rejected digest')
      }
      await pool.query(
        `UPDATE learning_notification_deliveries
            SET status='sent',sent_at=NOW(),error=NULL,lease_token=NULL,lease_expires_at=NULL,updated_at=NOW()
          WHERE id=$1 AND lease_token=$2`,
        [row.id, leaseToken],
      )
      inc('learning.notification.delivered', { channel: row.channel, status: 'sent' })
    } catch (error) {
      await pool.query(
        `UPDATE learning_notification_deliveries
            SET status='failed',error=$3,available_at=NOW()+(LEAST(60,POWER(2,attempts))::int*INTERVAL '1 minute'),
                lease_token=NULL,lease_expires_at=NULL,updated_at=NOW()
          WHERE id=$1 AND lease_token=$2`,
        [row.id, leaseToken, error instanceof Error ? error.message : String(error)],
      )
      inc('learning.notification.delivered', { channel: row.channel, status: 'failed' })
    }
  }
}

export async function runLearningNotificationSweep(now = new Date()): Promise<void> {
  await prepareDeliveries(now)
  await deliverPending(now)
}

export function startLearningNotificationScheduler(
  intervalMs = Number(process.env.LEARNING_NOTIFICATION_INTERVAL_MS ?? 60_000),
): WorkerTaskHandle | null {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return null
  const tick = () => void runLearningNotificationSweep().catch((error) => {
    console.warn('[learning] notification sweep failed:', error instanceof Error ? error.message : String(error))
  })
  const immediate = setImmediate(tick)
  const timer = setInterval(tick, Math.max(10_000, intervalMs))
  timer.unref?.()
  return { stop: () => { clearImmediate(immediate); clearInterval(timer) } }
}
