import type { Queryable } from '../../db/queryable.js'
import type { BriefingPolicy, ProjectVisit, TeacherBriefingDelivery } from './contracts.js'

export async function recordMeaningfulProjectVisit(db: Queryable, args: {
  companyId: string; projectId: string; userId: string; briefingEligible: boolean
  eventSequence: number; policy: BriefingPolicy
}): Promise<void> {
  await db.query(
    `INSERT INTO project_visits
       (company_id,project_id,user_id,visit_event_sequence,event_sequence_watermark,
        visit_policy_version,briefing_eligible)
     VALUES($1,$2,$3,$4,0,$5,$6)
     ON CONFLICT(project_id,user_id) DO UPDATE SET
       meaningful_visited_at=CASE
         WHEN project_visits.visited_at<=NOW()-($7::int*INTERVAL '1 minute') THEN NOW()
         ELSE project_visits.meaningful_visited_at END,
       meaningful_visit_version=project_visits.meaningful_visit_version+CASE
         WHEN project_visits.visited_at<=NOW()-($7::int*INTERVAL '1 minute') THEN 1 ELSE 0 END,
       visit_event_sequence=CASE
         WHEN project_visits.visited_at<=NOW()-($7::int*INTERVAL '1 minute') THEN EXCLUDED.visit_event_sequence
         ELSE project_visits.visit_event_sequence END,
       visit_policy_version=EXCLUDED.visit_policy_version,
       briefing_eligible=EXCLUDED.briefing_eligible,
       visited_at=NOW()`,
    [args.companyId, args.projectId, args.userId, args.eventSequence,
      args.policy.version, args.briefingEligible, args.policy.meaningfulAfterMinutes],
  )
}

export async function listBriefingVisitCandidates(db: Queryable, limit = 100): Promise<ProjectVisit[]> {
  const { rows } = await db.query<ProjectVisit>(
    `SELECT visit.company_id,visit.project_id,visit.user_id,visit.meaningful_visit_version,
            visit.visit_event_sequence,visit.event_sequence_watermark
       FROM project_visits visit
      WHERE visit.briefing_eligible=TRUE
        AND visit.visit_event_sequence>visit.event_sequence_watermark
        AND NOT EXISTS (
          SELECT 1 FROM teacher_briefings outstanding
           WHERE outstanding.company_id=visit.company_id AND outstanding.project_id=visit.project_id
             AND outstanding.teacher_user_id=visit.user_id
             AND outstanding.status IN ('PENDING','SENDING','FAILED'))
        AND NOT EXISTS (
          SELECT 1 FROM teacher_briefings briefing
           WHERE briefing.company_id=visit.company_id AND briefing.project_id=visit.project_id
             AND briefing.teacher_user_id=visit.user_id
             AND briefing.meaningful_visit_version=visit.meaningful_visit_version)
      ORDER BY visit.meaningful_visited_at,visit.project_id,visit.user_id
      LIMIT $1`,
    [limit],
  )
  return rows
}

export async function lockProjectVisit(db: Queryable, visit: ProjectVisit): Promise<ProjectVisit | null> {
  const { rows } = await db.query<ProjectVisit>(
    `SELECT company_id,project_id,user_id,meaningful_visit_version,
            visit_event_sequence,event_sequence_watermark
       FROM project_visits
      WHERE company_id=$1 AND project_id=$2 AND user_id=$3 FOR UPDATE`,
    [visit.company_id, visit.project_id, visit.user_id],
  )
  return rows[0] ?? null
}

export async function insertTeacherBriefing(db: Queryable, args: {
  id: string
  visit: ProjectVisit
  contextThreadId: string
  channelId: string
  senderAgentId: string
  policyVersion: string
  statistics: Record<string, number>
  summary: string
  clientMsgNo: string
  attentionItemIds: string[]
}): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO teacher_briefings
       (id,company_id,project_id,teacher_user_id,context_thread_id,channel_id,sender_agent_id,meaningful_visit_version,
        policy_version,window_start_sequence,window_end_sequence,statistics,summary,client_msg_no)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14)
     ON CONFLICT(company_id,project_id,teacher_user_id,meaningful_visit_version) DO NOTHING`,
    [args.id, args.visit.company_id, args.visit.project_id, args.visit.user_id,
      args.contextThreadId, args.channelId, args.senderAgentId,
      args.visit.meaningful_visit_version, args.policyVersion,
      args.visit.event_sequence_watermark, args.visit.visit_event_sequence,
      JSON.stringify(args.statistics), args.summary, args.clientMsgNo],
  )
  if ((result.rowCount ?? 0) === 0) return false
  for (const attentionItemId of args.attentionItemIds) {
    await db.query(
      `INSERT INTO teacher_briefing_attention_items
         (company_id,project_id,briefing_id,attention_item_id)
       VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [args.visit.company_id, args.visit.project_id, args.id, attentionItemId],
    )
  }
  return true
}

export async function claimTeacherBriefings(
  db: Queryable,
  now: Date,
  leaseToken: string,
): Promise<TeacherBriefingDelivery[]> {
  const { rows } = await db.query<TeacherBriefingDelivery>(
    `WITH claimable AS (
       SELECT id FROM teacher_briefings
        WHERE (status IN ('PENDING','FAILED') AND attempts<5 AND available_at<=$1)
          OR (status='SENDING' AND attempts<=5 AND lease_expires_at<=$1)
        ORDER BY available_at,created_at FOR UPDATE SKIP LOCKED LIMIT 50
     ), claimed AS (
       UPDATE teacher_briefings briefing SET
         status='SENDING',attempts=CASE WHEN briefing.status='SENDING'
           THEN briefing.attempts ELSE briefing.attempts+1 END,lease_token=$2,
         lease_expires_at=$1+INTERVAL '5 minutes'
       FROM claimable WHERE briefing.id=claimable.id RETURNING briefing.*
     )
     SELECT claimed.id,claimed.company_id,claimed.project_id,claimed.teacher_user_id,
            claimed.context_thread_id,claimed.client_msg_no,claimed.summary,claimed.statistics,
            claimed.window_start_sequence,claimed.window_end_sequence,
            claimed.channel_id,claimed.sender_agent_id AS agent_id,
            COALESCE(jsonb_agg(link.attention_item_id ORDER BY link.attention_item_id)
              FILTER(WHERE link.attention_item_id IS NOT NULL),'[]'::jsonb) AS attention_item_ids,
            claimed.lease_token
       FROM claimed
       LEFT JOIN teacher_briefing_attention_items link ON link.briefing_id=claimed.id
      GROUP BY claimed.id,claimed.company_id,claimed.project_id,claimed.teacher_user_id,
        claimed.context_thread_id,claimed.client_msg_no,claimed.summary,claimed.statistics,
        claimed.window_start_sequence,claimed.window_end_sequence,claimed.channel_id,
        claimed.sender_agent_id,claimed.lease_token`,
    [now, leaseToken],
  )
  return rows
}

export async function listPreviousTeacherBriefingStatistics(
  db: Queryable,
  briefing: Pick<TeacherBriefingDelivery, 'id' | 'company_id' | 'project_id' | 'teacher_user_id'>,
): Promise<Record<string, number>[]> {
  const { rows } = await db.query<{ statistics: Record<string, number> }>(
    `SELECT statistics FROM teacher_briefings
      WHERE company_id=$1 AND project_id=$2 AND teacher_user_id=$3
        AND id<>$4 AND status='SENT'
      ORDER BY created_at DESC,id DESC LIMIT 7`,
    [briefing.company_id, briefing.project_id, briefing.teacher_user_id, briefing.id],
  )
  return rows.reverse().map((row) => row.statistics)
}

export async function markTeacherBriefingSent(db: Queryable, args: {
  id: string; leaseToken: string; messageId: string; messageSequence: number
}): Promise<void> {
  const { rows } = await db.query<{ company_id: string; project_id: string; teacher_user_id: string; window_end_sequence: string }>(
    `UPDATE teacher_briefings SET
       status='SENT',message_id=$3,message_sequence=$4,sent_at=NOW(),error=NULL,
       lease_token=NULL,lease_expires_at=NULL
      WHERE id=$1 AND lease_token=$2 AND status='SENDING'
      RETURNING company_id,project_id,teacher_user_id,window_end_sequence`,
    [args.id, args.leaseToken, args.messageId, args.messageSequence],
  )
  const briefing = rows[0]
  if (!briefing) return
  await db.query(
    `UPDATE project_visits SET
       event_sequence_watermark=GREATEST(event_sequence_watermark,$4),last_briefing_id=$3
      WHERE company_id=$1 AND project_id=$2 AND user_id=$5`,
    [briefing.company_id, briefing.project_id, args.id,
      briefing.window_end_sequence, briefing.teacher_user_id],
  )
}

export async function markTeacherBriefingFailed(db: Queryable, args: {
  id: string; leaseToken: string; error: string
}): Promise<void> {
  await db.query(
    `UPDATE teacher_briefings SET
       status=CASE WHEN attempts>=5 THEN 'CANCELLED' ELSE 'FAILED' END,
       error=$3,available_at=NOW()+(LEAST(60,POWER(2,attempts))::int*INTERVAL '1 minute'),
       lease_token=NULL,lease_expires_at=NULL
      WHERE id=$1 AND lease_token=$2`,
    [args.id, args.leaseToken, args.error.slice(0, 2000)],
  )
}
