import { randomUUID } from 'node:crypto'
import { pool } from '../../db/pool.js'
import type { Queryable } from '../../db/queryable.js'
import { withTransaction } from '../../db/transaction.js'
import { env } from '../../env.js'
import { inc } from '../../metrics.js'
import type { WorkerTaskHandle } from '../../runtime/lifecycle.js'
import { isActiveProjectMember } from '../access/public.js'
import { formatAddress, mintMessageId, sendViaProvider } from '../email/index.js'
import type { NotificationChannel } from './contracts.js'
import { findNotificationPreferences } from './repository.js'
import {
  intentPresentation,
  routingWindow,
  type NotificationSourceEvent,
  type RoutableIntent,
} from './routing.js'

interface DeliveryClaim {
  id: string
  channel: NotificationChannel
  summary: string
  link_path: string
  email: string | null
}

async function projectEvents(db: Queryable): Promise<NotificationSourceEvent[]> {
  const { rows } = await db.query<NotificationSourceEvent>(
    `SELECT event.sequence,event.company_id,event.project_id,event.event_type,event.aggregate_id,event.payload,event.occurred_at,
            COALESCE(event.payload->>'learnerId',learning_case.user_id,
                     event.payload->>'subjectParticipantId') AS recipient_user_id,
            context_thread.channel_id AS context_channel_id
       FROM domain_events event
       LEFT JOIN learning_cases learning_case
         ON learning_case.company_id=event.company_id AND learning_case.project_id=event.project_id
        AND learning_case.id=event.aggregate_id
       LEFT JOIN context_threads context_thread
         ON context_thread.company_id=event.company_id AND context_thread.project_id=event.project_id
        AND context_thread.id=event.aggregate_id
      WHERE event.project_id IS NOT NULL
        AND event.event_type=ANY($1::text[])
        AND NOT EXISTS (
          SELECT 1 FROM notification_intents intent
           WHERE intent.source_event_sequence=event.sequence
             AND intent.recipient_user_id=COALESCE(event.payload->>'learnerId',learning_case.user_id,
                                                    event.payload->>'subjectParticipantId'))
      ORDER BY event.sequence LIMIT 200`,
    [['ASSESSMENT.ATTEMPT_SUBMITTED', 'LEARNING_CASE.DETECTED',
      'LEARNING_CASE.ACTION_APPLIED', 'ContextThreadCreated']],
  )
  return rows
}

async function projectIntents(now: Date): Promise<void> {
  for (const event of await projectEvents(pool)) {
    if (!await isActiveProjectMember(pool, {
      companyId: event.company_id, projectId: event.project_id, userId: event.recipient_user_id,
    })) continue
    const presentation = intentPresentation(event)
    if (!presentation) continue
    await pool.query(
      `INSERT INTO notification_intents
         (id,company_id,project_id,recipient_user_id,source_event_sequence,category,policy,summary,link_path,available_at,created_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT(source_event_sequence,recipient_user_id) DO NOTHING`,
      [randomUUID(), event.company_id, event.project_id, event.recipient_user_id, event.sequence,
        presentation.category, presentation.policy, presentation.summary, presentation.linkPath, now, event.occurred_at],
    )
  }
}

async function routeIntent(intentId: string, now: Date): Promise<void> {
  await withTransaction(pool, async (db) => {
    const { rows } = await db.query<RoutableIntent>(
      `SELECT id,company_id,project_id,recipient_user_id,source_event_sequence,policy,summary,link_path,created_at
         FROM notification_intents WHERE id=$1 AND status='PENDING' FOR UPDATE`,
      [intentId],
    )
    const intent = rows[0]
    if (!intent) return
    const preference = await findNotificationPreferences(
      db, intent.company_id, intent.recipient_user_id, intent.project_id,
    ) ?? {
      company_id: intent.company_id, user_id: intent.recipient_user_id, project_id: intent.project_id,
      in_app_enabled: true, email_enabled: false, push_enabled: false,
      timezone: 'Asia/Shanghai', daily_time: '19:00:00', weekly_day: 1,
      quiet_start: null, quiet_end: null,
    }
    const windowKey = routingWindow(intent, preference, now)
    if (!windowKey) return
    const channels: NotificationChannel[] = [
      ...(preference.in_app_enabled ? ['IN_APP' as const] : []),
      ...(preference.email_enabled ? ['EMAIL' as const] : []),
    ]
    if (channels.length === 0) {
      await db.query(`UPDATE notification_intents SET status='CANCELLED' WHERE id=$1`, [intent.id])
      return
    }
    for (const channel of channels) {
      const { rows: deliveryRows } = await db.query<{ id: string }>(
        `INSERT INTO notification_deliveries
           (id,company_id,project_id,recipient_user_id,channel,policy,window_key,summary,link_path,available_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT(company_id,project_id,recipient_user_id,channel,policy,window_key)
         DO UPDATE SET updated_at=NOW() RETURNING id`,
        [randomUUID(), intent.company_id, intent.project_id, intent.recipient_user_id, channel,
          intent.policy, windowKey, intent.summary, intent.link_path, now],
      )
      const deliveryId = deliveryRows[0]?.id
      if (!deliveryId) throw new Error('notification delivery was not materialized')
      await db.query(
        `INSERT INTO notification_delivery_intents(company_id,project_id,delivery_id,intent_id)
         VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [intent.company_id, intent.project_id, deliveryId, intent.id],
      )
      await db.query(
        `UPDATE notification_deliveries delivery SET
           summary=CASE WHEN linked.count=1 THEN $2 ELSE linked.count||' 条通知摘要' END,
           link_path=CASE WHEN linked.count=1 THEN $3 ELSE $4 END,
           updated_at=NOW()
         FROM (SELECT COUNT(*)::int AS count FROM notification_delivery_intents WHERE delivery_id=$1) linked
         WHERE delivery.id=$1`,
        [deliveryId, intent.summary, intent.link_path,
          `/learning?projectId=${encodeURIComponent(intent.project_id)}`],
      )
    }
    await db.query(`UPDATE notification_intents SET status='ROUTED' WHERE id=$1`, [intent.id])
  })
}

async function routePending(now: Date): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM notification_intents WHERE status='PENDING' AND available_at<=$1
      ORDER BY available_at,source_event_sequence LIMIT 200`,
    [now],
  )
  for (const row of rows) await routeIntent(row.id, now)
}

async function claimDeliveries(now: Date, leaseToken: string): Promise<DeliveryClaim[]> {
  return withTransaction(pool, async (db) => {
    const { rows } = await db.query<DeliveryClaim>(
      `WITH claimable AS (
         SELECT id FROM notification_deliveries
          WHERE attempts<5 AND (
            (status IN ('PENDING','FAILED') AND available_at<=$1)
            OR (status='SENDING' AND lease_expires_at<=$1))
          ORDER BY available_at,created_at FOR UPDATE SKIP LOCKED LIMIT 100
       ), claimed AS (
         UPDATE notification_deliveries delivery SET
           status='SENDING',attempts=delivery.attempts+1,lease_token=$2,
           lease_expires_at=$1+INTERVAL '5 minutes',updated_at=$1
         FROM claimable WHERE delivery.id=claimable.id RETURNING delivery.*
       )
       SELECT claimed.id,claimed.channel,claimed.summary,claimed.link_path,
              users.email
         FROM claimed JOIN users ON users.id=claimed.recipient_user_id`,
      [now, leaseToken],
    )
    return rows
  })
}

async function deliverPending(now: Date): Promise<void> {
  const leaseToken = randomUUID()
  for (const delivery of await claimDeliveries(now, leaseToken)) {
    try {
      if (delivery.channel === 'EMAIL') {
        if (!env.EMAIL_DOMAIN || !delivery.email) throw new Error('email delivery is not configured for this user')
        const result = await sendViaProvider({
          from: formatAddress(`notifications@${env.EMAIL_DOMAIN}`, 'LingxiLoop'),
          to: [delivery.email], subject: 'LingxiLoop 通知',
          text: `${delivery.summary}\n\n打开：${delivery.link_path}`,
          messageId: mintMessageId(), idempotencyKey: `notification:${delivery.id}`,
          autoSubmitted: 'auto-generated',
        })
        if (!result.ok) throw new Error(result.error ?? 'email provider rejected notification')
      }
      await pool.query(
        `UPDATE notification_deliveries SET status='SENT',sent_at=NOW(),error=NULL,
           lease_token=NULL,lease_expires_at=NULL,updated_at=NOW()
         WHERE id=$1 AND lease_token=$2`,
        [delivery.id, leaseToken],
      )
      inc('notification.delivered', { channel: delivery.channel, status: 'sent' })
    } catch (error) {
      await pool.query(
        `UPDATE notification_deliveries SET
           status=CASE WHEN attempts>=5 THEN 'CANCELLED' ELSE 'FAILED' END,
           error=$3,available_at=NOW()+(LEAST(60,POWER(2,attempts))::int*INTERVAL '1 minute'),
           lease_token=NULL,lease_expires_at=NULL,updated_at=NOW()
         WHERE id=$1 AND lease_token=$2`,
        [delivery.id, leaseToken, error instanceof Error ? error.message : String(error)],
      )
      inc('notification.delivered', { channel: delivery.channel, status: 'failed' })
    }
  }
}

export async function runNotificationSweep(now = new Date()): Promise<void> {
  await projectIntents(now)
  await routePending(now)
  await deliverPending(now)
}

export function startNotificationScheduler(
  intervalMs = Number(process.env.NOTIFICATION_INTERVAL_MS ?? 60_000),
): WorkerTaskHandle | null {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return null
  const tick = () => void runNotificationSweep().catch((error) => {
    console.warn('[notifications] sweep failed:', error instanceof Error ? error.message : String(error))
  })
  const immediate = setImmediate(tick)
  const timer = setInterval(tick, Math.max(10_000, intervalMs))
  timer.unref?.()
  return { stop: () => { clearImmediate(immediate); clearInterval(timer) } }
}
