import { createHash, createHmac, randomUUID } from 'node:crypto'
import { Router, type Request, type Response, type NextFunction } from 'express'
import type { AuthedRequest } from '../auth.js'
import { pool } from '../db/pool.js'
import { executeActionWithLedger } from '../agent-os/control-plane.js'
import type { AgentWorkItem, HostAction } from '../agent-os/types.js'
import { wukongClient } from './wukong.js'
import type { ImChannelProfile } from './types.js'
import type { LingxiMessageV1 } from '../agent-os/types.js'
import { assertTeacherApprovalFresh } from '../modules/learning/runtime.js'
import { assertTeacherRoomAccessible, isTeacherRoom } from '../modules/learning/public.js'
import {
  listReadReceiptAdvances,
  publishReadReceiptAdvance,
  recordReadReceiptAdvance,
} from './read-receipts.js'

export const imRouter = Router()

function safe(handler: (req: Request & AuthedRequest, res: Response) => Promise<void>): (req: Request & AuthedRequest, res: Response, next: NextFunction) => void {
  return (req, res, next) => { void handler(req, res).catch(next) }
}

async function identity(req: Request & AuthedRequest): Promise<{ userId: string; companyId: string }> {
  const userId = req.authUserId
  const companyId = String(req.headers['x-company-id'] ?? '').trim()
  if (!userId) throw Object.assign(new Error('authentication required'), { status: 401 })
  if (!companyId) throw Object.assign(new Error('x-company-id required'), { status: 400 })
  const { rows } = await pool.query(
    `SELECT 1 FROM company_members WHERE user_id=$1 AND company_id=$2`,
    [userId, companyId],
  )
  if (!rows[0]) throw Object.assign(new Error('not a company member'), { status: 403 })
  return { userId, companyId }
}

function userImToken(uid: string): string {
  const secret = process.env.WUKONG_USER_TOKEN_SECRET?.trim() || process.env.AGENT_OS_SERVICE_TOKEN?.trim()
  if (!secret) throw new Error('WUKONG_USER_TOKEN_SECRET or AGENT_OS_SERVICE_TOKEN is required')
  return createHmac('sha256', secret).update(`wukong-user:${uid}`).digest('base64url')
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

imRouter.get('/bootstrap', safe(async (req, res) => {
  const { userId } = await identity(req)
  res.json(await wukongClient().bootstrap(userId, userImToken(userId)))
}))

imRouter.post('/refresh', safe(async (req, res) => {
  const { userId } = await identity(req)
  res.json(await wukongClient().bootstrap(userId, userImToken(userId)))
}))

imRouter.get('/channels', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  const projectId = String(req.headers['x-project-id'] ?? '').trim()
  if (!projectId) { res.status(400).json({ error: 'x-project-id required' }); return }
  const { rows } = await pool.query<{
    channel_id: string; profile: Record<string, unknown>; leader_agent_id: string | null; preset_key: string | null
    kind: string; title: string; members: string[]; muted: boolean; muted_until: string | null
  }>(`SELECT b.channel_id, b.profile, b.leader_agent_id, b.preset_key,c.kind,c.members,
              CASE WHEN c.kind='direct' THEN COALESCE(other_participant.name,c.title) ELSE c.title END AS title,
              (mute.user_id IS NOT NULL AND (mute.muted_until IS NULL OR mute.muted_until>NOW())) AS muted,
              mute.muted_until
         FROM im_channel_bindings b JOIN conversations c ON c.id = b.channel_id
         LEFT JOIN conversation_mutes mute ON mute.conversation_id=c.id AND mute.user_id=$2
         LEFT JOIN LATERAL (
           SELECT participant.name
             FROM jsonb_array_elements_text(c.members) WITH ORDINALITY AS member(id,ord)
             JOIN participants participant ON participant.id=member.id AND participant.company_id=c.company_id
            WHERE member.id<>$2 ORDER BY member.ord LIMIT 1
         ) other_participant ON c.kind='direct'
       WHERE b.company_id=$1 AND c.company_id=$1 AND c.project_id=$3
         AND c.members @> to_jsonb(ARRAY[$2::text])
         AND (NOT EXISTS(SELECT 1 FROM learning_course_teacher_rooms tr WHERE tr.conversation_id=b.channel_id)
           OR EXISTS(SELECT 1 FROM learning_course_teacher_rooms tr
             JOIN courses course ON course.id=tr.course_id AND course.company_id=tr.company_id
             JOIN projects project ON project.id=course.project_id AND project.company_id=course.company_id
             JOIN course_members cm ON cm.course_id=course.id AND cm.company_id=course.company_id
               AND cm.user_id=$2 AND cm.role='teacher'
             WHERE tr.conversation_id=b.channel_id AND tr.company_id=b.company_id
               AND tr.status='active' AND project.status='active'))
       ORDER BY (b.profile->>'pinned')::boolean DESC,b.created_at`, [companyId, userId, projectId])
  const conversations = await wukongClient().listConversations(userId)
  const state = new Map(conversations.map((item) => [`${item.channelId}:${item.channelType}`, item]))
  res.json(rows.map((row) => {
    const channelType = Number(row.profile.channelType ?? 2)
    const im = state.get(`${row.channel_id}:${channelType}`)
    const last = im?.lastMessage
    return ({
    id: row.channel_id,
    kind: row.kind === 'direct' ? 'direct' : 'group',
    title: row.title,
    subtitle: null,
    topic: typeof row.profile.topic === 'string' ? row.profile.topic : null,
    members: row.members,
    leaderId: row.leader_agent_id,
    pinned: row.profile.pinned === true,
    muted: row.muted,
    mutedUntil: row.muted_until,
    tag: row.preset_key ? 'team' : null,
    pulledBy: null,
    createdAt: typeof row.profile.createdAt === 'string' ? row.profile.createdAt : new Date(0).toISOString(),
    updatedAt: last ? new Date(last.timestamp * 1000).toISOString() : typeof row.profile.updatedAt === 'string' ? row.profile.updatedAt : new Date(0).toISOString(),
    unreadCount: im?.unread ?? 0,
    lastMessage: last ? {
      id: last.messageId || last.clientMsgNo, authorId: last.fromUid, kind: last.payload.kind,
      body: last.payload.body ?? '', createdAt: new Date(last.timestamp * 1000).toISOString(),
    } : null,
    presetKey: row.preset_key,
  }) }))
}))

imRouter.post('/channels', safe(async (req, res) => {
  const { companyId } = await identity(req)
  const profile = req.body as ImChannelProfile
  if (!profile.channelId || !profile.title || !Array.isArray(profile.members)) {
    res.status(400).json({ error: 'channelId, title and members required' }); return
  }
  const protectedIds=[...profile.members.map(String),...(profile.leaderAgentId?[String(profile.leaderAgentId)]:[])]
  const {rows:protectedAgents}=await pool.query(
    `SELECT 1 FROM learning_project_teacher_agents WHERE company_id=$1 AND agent_id=ANY($2::text[]) LIMIT 1`,
    [companyId,protectedIds],
  )
  if(protectedAgents[0]){res.status(403).json({error:'Pulse rooms are provisioned only by the learning control plane'});return}
  if (await isTeacherRoom(profile.channelId, companyId)) {
    res.status(403).json({ error: 'teacher rooms are provisioned only by the learning control plane' }); return
  }
  const { rows: conversations } = await pool.query(
    `SELECT 1 FROM conversations WHERE id=$1 AND company_id=$2`,
    [profile.channelId, companyId],
  )
  if (!conversations[0]) { res.status(404).json({ error: 'conversation not found in workspace' }); return }
  await wukongClient().upsertChannel(profile)
  await pool.query(
    `INSERT INTO im_channel_bindings (channel_id, company_id, profile, leader_agent_id, preset_key)
     VALUES ($1,$2,$3::jsonb,$4,$5)
     ON CONFLICT (channel_id) DO UPDATE SET profile=EXCLUDED.profile, leader_agent_id=EXCLUDED.leader_agent_id,
       preset_key=EXCLUDED.preset_key, updated_at=NOW()
     WHERE im_channel_bindings.company_id=EXCLUDED.company_id`,
    [profile.channelId, companyId, JSON.stringify(profile), profile.leaderAgentId ?? null, profile.presetKey ?? null],
  )
  res.status(201).json({ ok: true, channelId: profile.channelId })
}))

imRouter.get('/channels/:id/messages', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  const channelId = String(req.params.id)
  await assertTeacherRoomAccessible(channelId,companyId,userId)
  const { rows } = await pool.query<{ profile: Record<string, unknown> }>(
    `SELECT b.profile FROM im_channel_bindings b JOIN conversations c ON c.id=b.channel_id
      WHERE b.channel_id=$1 AND b.company_id=$2 AND c.members @> to_jsonb(ARRAY[$3::text])`, [channelId, companyId, userId],
  )
  if (!rows[0]) { res.status(404).json({ error: 'channel not found' }); return }
  const limit = Math.max(1, Math.min(200, Number(req.query.limit ?? 80)))
  res.json(await wukongClient().syncMessages(channelId, Number(rows[0].profile.channelType ?? 2), limit, userId))
}))

imRouter.post('/channels/:id/messages/accept', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  const channelId = String(req.params.id)
  await assertTeacherRoomAccessible(channelId,companyId,userId)
  const clientNonce = String(req.body?.clientNonce ?? '').trim()
  const rawPayload = req.body?.payload as LingxiMessageV1
  if (!clientNonce || clientNonce.length > 80 || !rawPayload || rawPayload.version !== 1 || rawPayload.clientMsgNo !== clientNonce) {
    res.status(400).json({ error: 'valid clientNonce and matching LingxiMessageV1 payload required' }); return
  }
  const rawData = rawPayload.data && typeof rawPayload.data === 'object' ? rawPayload.data : {}
  const { suppressAgentWake: _suppressAgentWake, ...safeData } = rawData
  const payload: LingxiMessageV1 = {
    version: 1, kind: rawPayload.kind, clientMsgNo: clientNonce,
    ...(rawPayload.body ? { body: rawPayload.body } : {}),
    ...(rawPayload.replyToClientMsgNo ? { replyToClientMsgNo: rawPayload.replyToClientMsgNo } : {}),
    data: safeData,
  }
  if (!['text', 'attachment'].includes(payload.kind) || (!payload.body?.trim() && payload.kind !== 'attachment')) {
    res.status(400).json({ error: 'invalid user message payload' }); return
  }
  const { rows: bindings } = await pool.query<{ profile: Record<string, unknown> }>(
    `SELECT b.profile FROM im_channel_bindings b JOIN conversations c ON c.id=b.channel_id
      WHERE b.channel_id=$1 AND b.company_id=$2 AND c.members @> to_jsonb(ARRAY[$3::text])`, [channelId, companyId, userId],
  )
  const members = Array.isArray(bindings[0]?.profile.members) ? bindings[0].profile.members.map(String) : []
  if (!bindings[0]) { res.status(404).json({ error: 'channel not found' }); return }
  if (!members.includes(userId)) { res.status(403).json({ error: 'not a channel member' }); return }
  const channelType = Number(bindings[0].profile.channelType ?? 2)
  const inputDigest = createHash('sha256').update(canonicalJson({ channelId, channelType, payload })).digest('hex')
  const client = await pool.connect()
  try {
    await client.query(`SELECT pg_advisory_lock(hashtextextended($1,0))`, [`im-send:${companyId}:${userId}:${clientNonce}`])
    await client.query(
      `INSERT INTO im_send_acceptances(company_id,user_id,client_nonce,input_digest,channel_id,channel_type,payload)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT(company_id,user_id,client_nonce) DO NOTHING`,
      [companyId, userId, clientNonce, inputDigest, channelId, channelType, JSON.stringify(payload)],
    )
    const { rows } = await client.query<{ input_digest: string; status: string; echo: Record<string, unknown> | null }>(
      `SELECT input_digest,status,echo FROM im_send_acceptances WHERE company_id=$1 AND user_id=$2 AND client_nonce=$3`,
      [companyId, userId, clientNonce],
    )
    const acceptance = rows[0]
    if (!acceptance || acceptance.input_digest !== inputDigest) { res.status(409).json({ error: 'clientNonce was reused with different input' }); return }
    if (acceptance.status === 'accepted' && acceptance.echo) { res.json({ status: 'accepted', echo: acceptance.echo, duplicate: true }); return }
    try {
      const sent = await wukongClient().sendMessage(channelId, channelType, userId, payload)
      const echo = {
        messageId: sent.messageId, messageSeq: sent.messageSeq, clientMsgNo: clientNonce,
        channelId, channelType, fromUid: userId, timestamp: Math.floor(Date.now() / 1000), payload,
      }
      await client.query(
        `UPDATE im_send_acceptances SET status='accepted',echo=$4::jsonb,error=NULL,updated_at=NOW()
          WHERE company_id=$1 AND user_id=$2 AND client_nonce=$3`,
        [companyId, userId, clientNonce, JSON.stringify(echo)],
      )
      res.status(202).json({ status: 'accepted', echo })
    } catch (error) {
      await client.query(
        `UPDATE im_send_acceptances SET status='pending',error=$4,updated_at=NOW()
          WHERE company_id=$1 AND user_id=$2 AND client_nonce=$3`,
        [companyId, userId, clientNonce, error instanceof Error ? error.message : String(error)],
      )
      throw error
    }
  } finally {
    await client.query(`SELECT pg_advisory_unlock(hashtextextended($1,0))`, [`im-send:${companyId}:${userId}:${clientNonce}`]).catch(() => undefined)
    client.release()
  }
}))

imRouter.get('/sends/:clientNonce', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  const { rows } = await pool.query(
    `SELECT a.status,a.echo,a.error,a.channel_id AS "channelId",a.updated_at AS "updatedAt"
       FROM im_send_acceptances a JOIN conversations c ON c.id=a.channel_id
      WHERE a.company_id=$1 AND a.user_id=$2 AND a.client_nonce=$3 AND c.members @> to_jsonb(ARRAY[$2::text])`,
    [companyId, userId, String(req.params.clientNonce)],
  )
  if (!rows[0]) { res.status(404).json({ error: 'send acceptance not found' }); return }
  res.json(rows[0])
}))

imRouter.post('/channels/:id/read', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  const channelId = String(req.params.id)
  await assertTeacherRoomAccessible(channelId,companyId,userId)
  const { rows } = await pool.query<{ profile: Record<string, unknown> }>(
    `SELECT b.profile FROM im_channel_bindings b JOIN conversations c ON c.id=b.channel_id
      WHERE b.channel_id=$1 AND b.company_id=$2 AND c.members @> to_jsonb(ARRAY[$3::text])`, [channelId, companyId, userId],
  )
  if (!rows[0]) { res.status(404).json({ error: 'channel not found' }); return }
  const channelType = Number(rows[0].profile.channelType ?? 2)
  const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {}
  const readThroughSeq = Number(body.readThroughSeq)
  if (!Number.isSafeInteger(readThroughSeq) || readThroughSeq <= 0) {
    res.status(400).json({ error: 'readThroughSeq must be a positive safe integer' })
    return
  }
  const latestRows = await wukongClient().syncMessages(channelId, channelType, 1, userId)
  const latestSeq = latestRows.reduce((max, message) => Math.max(max, message.messageSeq), 0)
  if (readThroughSeq > latestSeq) {
    res.status(400).json({ error: 'readThroughSeq exceeds latest channel sequence', latestSeq })
    return
  }
  await wukongClient().setUnread(userId, channelId, channelType, latestSeq - readThroughSeq)
  const receipt = await recordReadReceiptAdvance({ companyId, channelId, readerId: userId, readThroughSeq })
  if (receipt) await publishReadReceiptAdvance(receipt)
  res.json({ ok: true, latestSeq, receipt })
}))

imRouter.get('/channels/:id/read-receipts', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  const channelId = String(req.params.id)
  await assertTeacherRoomAccessible(channelId, companyId, userId)
  const member = await pool.query(
    `SELECT 1 FROM conversations
      WHERE id=$1 AND company_id=$2 AND members @> to_jsonb(ARRAY[$3::text])`,
    [channelId, companyId, userId],
  )
  if (!member.rows[0]) { res.status(404).json({ error: 'channel not found' }); return }
  const fromSeq = Number(req.query.fromSeq)
  const toSeq = Number(req.query.toSeq)
  if (!Number.isSafeInteger(fromSeq) || fromSeq <= 0 || !Number.isSafeInteger(toSeq) || toSeq < fromSeq) {
    res.status(400).json({ error: 'invalid receipt sequence range' })
    return
  }
  const receipts = await listReadReceiptAdvances({ companyId, channelId, fromSeq, toSeq })
  res.json({ channelId, fromSeq, toSeq, receipts })
}))

imRouter.get('/approvals', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  const { rows } = await pool.query(
    `SELECT a.* FROM agent_os_approvals a JOIN conversations c ON c.id=a.channel_id
      WHERE a.company_id=$1 AND c.members @> to_jsonb(ARRAY[$2::text])
        AND (NOT EXISTS(SELECT 1 FROM learning_course_teacher_rooms tr WHERE tr.conversation_id=a.channel_id)
          OR EXISTS(SELECT 1 FROM learning_course_teacher_rooms tr
            JOIN courses course ON course.id=tr.course_id AND course.company_id=tr.company_id
            JOIN projects project ON project.id=course.project_id AND project.company_id=course.company_id
            JOIN course_members cm ON cm.course_id=course.id AND cm.company_id=course.company_id
              AND cm.user_id=$2 AND cm.role='teacher'
            WHERE tr.conversation_id=a.channel_id AND tr.company_id=a.company_id
              AND tr.status='active' AND project.status='active'))
      ORDER BY a.requested_at DESC LIMIT 100`,
    [companyId, userId],
  )
  res.json(rows)
}))

imRouter.post('/approvals/:id/resolve', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  const approved = req.body?.approved === true
  const client = await pool.connect()
  let approval: {
    id: string; agent_id: string; channel_id: string; work_id: string; idempotency_key: string
    action: string; args: unknown; status: string; run_id: string; cell_id: string; call_index: number
    summary: string; requested_at: string; requested_by: string | null; scope: Record<string,unknown>; preview: Record<string,unknown>
  }
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<typeof approval>(
      `SELECT a.id, a.agent_id, a.channel_id, a.work_id, a.idempotency_key, a.action, a.args, a.status,
              a.summary,a.requested_at,a.requested_by,a.scope,a.preview,
              h.run_id, h.cell_id, h.call_index
         FROM agent_os_approvals a
         JOIN agent_host_actions h ON h.idempotency_key = a.idempotency_key
         JOIN conversations c ON c.id = a.channel_id
        WHERE a.id=$1 AND a.company_id=$2 AND c.members @> to_jsonb(ARRAY[$3::text])
          AND (NOT EXISTS(SELECT 1 FROM learning_course_teacher_rooms tr WHERE tr.conversation_id=a.channel_id)
            OR EXISTS(SELECT 1 FROM learning_course_teacher_rooms tr
              JOIN courses course ON course.id=tr.course_id AND course.company_id=tr.company_id
              JOIN projects project ON project.id=course.project_id AND project.company_id=course.company_id
              JOIN course_members cm ON cm.course_id=course.id AND cm.company_id=course.company_id
                AND cm.user_id=$3 AND cm.role='teacher'
              WHERE tr.conversation_id=a.channel_id AND tr.company_id=a.company_id
                AND tr.status='active' AND project.status='active'))
        FOR UPDATE OF a`, [req.params.id, companyId, userId],
    )
    if (!rows[0]) { await client.query('ROLLBACK'); res.status(404).json({ error: 'approval not found' }); return }
    approval = rows[0]
    const requestedStatus = approved ? 'approved' : 'rejected'
    if (approval.status !== 'pending' && approval.status !== requestedStatus) {
      await client.query('ROLLBACK'); res.status(409).json({ error: `approval already ${approval.status}` }); return
    }
    const approvalTtlMs=Math.max(60_000,Number(process.env.AGENT_OS_APPROVAL_TTL_MS??24*60*60_000))
    if(approval.status==='pending'&&approved&&Date.now()-new Date(approval.requested_at).getTime()>approvalTtlMs){
      const message='approval expired; request a fresh operation preview'
      await client.query(`UPDATE agent_os_approvals SET status='expired',resolved_at=NOW(),resolved_by=$2,error=$3 WHERE id=$1`,[approval.id,userId,message])
      await client.query('COMMIT')
      res.status(409).json({error:message,status:'expired'})
      return
    }
    if (approval.status === 'pending' && approved && approval.action.startsWith('teacher.')) {
      try {
        await assertTeacherApprovalFresh({ channelId: approval.channel_id, companyId, action: approval.action, preview: approval.preview ?? {} }, client)
      } catch (error) {
        const message=error instanceof Error?error.message:String(error)
        await client.query(`UPDATE agent_os_approvals SET status='expired',resolved_at=NOW(),resolved_by=$2,error=$3 WHERE id=$1`,[approval.id,userId,message])
        await client.query('COMMIT')
        res.status(409).json({error:message,status:'expired'})
        return
      }
    }
    if (approval.status === 'pending') {
      await client.query(
        `UPDATE agent_os_approvals SET status=$2, resolved_at=NOW(), resolved_by=$3 WHERE id=$1`,
        [approval.id, requestedStatus, userId],
      )
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally { client.release() }

  let result: unknown = { approved: false }
  let error: string | null = null
  const {rows:source}=await pool.query<{
    company_id:string;agent_id:string;channel_id:string;thread_root_client_msg_no:string|null;trigger_client_msg_no:string;
    reason:AgentWorkItem['reason'];fence:string;execution_role:AgentWorkItem['executionRole']
  }>(`SELECT company_id,agent_id,channel_id,thread_root_client_msg_no,trigger_client_msg_no,reason,fence,execution_role FROM agent_work_items WHERE id=$1`,[approval.work_id])
  if(!source[0]) throw new Error('approval source work missing')
  const sourceExecutionRole=source[0].execution_role
  if (approved) {
    const work: AgentWorkItem = {
      id: approval.work_id, companyId: source[0].company_id, agentId: source[0].agent_id,
      channelId: source[0].channel_id, triggerClientMsgNo: `approval:${approval.id}`,
      reason: 'resume', lane: 'approval', fence: Number(source[0].fence), leaseToken: 'approval-resolution',
      executionRole: source[0].execution_role,
      ...(source[0].thread_root_client_msg_no ? { threadRootClientMsgNo: source[0].thread_root_client_msg_no } : {}),
    }
    const action: HostAction = {
      runId: approval.run_id, cellId: approval.cell_id, callIndex: approval.call_index,
      action: approval.action, args: approval.args, idempotencyKey: approval.idempotency_key,
    }
    const executed = await executeActionWithLedger(work, action, true)
    result = executed.value
    error = executed.error ?? null
    await pool.query(`UPDATE agent_os_approvals SET result=$2::jsonb, error=$3 WHERE id=$1`, [approval.id, result === undefined ? null : JSON.stringify(result), error])
  }
  const { rows: channelRows } = await pool.query<{ profile: Record<string, unknown> }>(
    `SELECT profile FROM im_channel_bindings WHERE channel_id=$1 AND company_id=$2`,
    [approval.channel_id, companyId],
  )
  await wukongClient().sendMessage(
    approval.channel_id,
    Number(channelRows[0]?.profile.channelType ?? 2),
    approval.agent_id,
    {
      version: 1, kind: 'approval', clientMsgNo: `approval-${approval.id}:resolved`,
      body: approved ? 'Approval granted' : 'Approval denied',
      refs: { approvalId: approval.id, agentId: approval.agent_id },
      data: {
        id: approval.id, agentId: approval.agent_id,
        kind: approval.action.startsWith('email.') ? 'external_communication' : String(approval.scope?.risk??'sensitive_or_destructive_action'),
        summary: approval.summary,
        status: approved ? 'approved' : 'rejected', payload: { action: approval.action, args: approval.args },
        requestedAt: approval.requested_at, resolvedAt: new Date().toISOString(), resolvedBy: userId,
        requestedBy: approval.requested_by, scope: approval.scope, preview: approval.preview, error,
        suppressAgentWake: true,
      },
    },
  ).catch(() => undefined)
  // Resolution is itself replayable: a crash after the decision commit (or
  // after the approved side effect) can safely repeat this request. The Host
  // Action ledger and its sink key recover the action, while this stable work
  // id recovers the continuation without creating a second run.
  const resumeId = `resume-${approval.id}`
  await pool.query(
    `INSERT INTO agent_work_items (id, company_id, agent_id, channel_id, trigger_client_msg_no, reason, priority,execution_role)
     VALUES ($1,$2,$3,$4,$5,'resume',200,$6)
     ON CONFLICT (agent_id, trigger_client_msg_no, reason) DO NOTHING`,
    [resumeId, companyId, approval.agent_id, approval.channel_id, `approval:${approval.id}`,sourceExecutionRole],
  )
  res.json({ ok: error === null, approved, result, error })
}))

imRouter.get('/routines', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  const { rows } = await pool.query(
    `SELECT routine.*
       FROM agent_routines routine
       JOIN conversations conversation ON conversation.id=routine.channel_id AND conversation.company_id=routine.company_id
      WHERE routine.company_id=$1 AND conversation.members @> to_jsonb(ARRAY[$2::text])
        AND (
          NOT EXISTS (SELECT 1 FROM learning_course_teacher_rooms room WHERE room.conversation_id=routine.channel_id AND room.company_id=routine.company_id)
          OR EXISTS (
            SELECT 1 FROM learning_course_teacher_rooms room
              JOIN courses course ON course.id=room.course_id AND course.company_id=room.company_id
              JOIN projects project ON project.id=course.project_id AND project.company_id=course.company_id
              JOIN course_members teacher ON teacher.course_id=course.id AND teacher.company_id=course.company_id
               AND teacher.user_id=$2 AND teacher.role='teacher'
             WHERE room.conversation_id=routine.channel_id AND room.company_id=routine.company_id
               AND room.status='active' AND project.status='active'
          )
        )
      ORDER BY routine.created_at DESC`,
    [companyId, userId],
  )
  res.json(rows)
}))

imRouter.post('/routines/:id/pause', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  const { rows: allowed } = await pool.query<{ channel_id: string }>(
    `SELECT routine.channel_id
       FROM agent_routines routine
       JOIN conversations conversation ON conversation.id=routine.channel_id AND conversation.company_id=routine.company_id
      WHERE routine.id=$1 AND routine.company_id=$2
        AND conversation.members @> to_jsonb(ARRAY[$3::text])`,
    [req.params.id, companyId, userId],
  )
  if (!allowed[0]) { res.status(404).json({ error: 'routine not found' }); return }
  await assertTeacherRoomAccessible(allowed[0].channel_id, companyId, userId)
  const { rows } = await pool.query(`UPDATE agent_routines SET status='paused', updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING *`, [req.params.id, companyId])
  if (!rows[0]) { res.status(404).json({ error: 'routine not found' }); return }
  res.json(rows[0])
}))

async function activeWorkForControl(companyId: string, userId: string, agentId: string, channelId: string): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT w.id FROM agent_work_items w
      JOIN im_channel_bindings b ON b.channel_id=w.channel_id AND b.company_id=w.company_id
      JOIN conversations c ON c.id=w.channel_id
     WHERE w.company_id=$1 AND c.members @> to_jsonb(ARRAY[$2::text]) AND w.agent_id=$3 AND w.channel_id=$4 AND w.status='leased'
     ORDER BY w.updated_at DESC LIMIT 1`,
    [companyId, userId, agentId, channelId],
  )
  return rows[0]?.id ?? null
}

imRouter.post('/runs/stop', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  const agentId = String(req.body?.agentId ?? '').trim()
  const channelId = String(req.body?.channelId ?? '').trim()
  if (!agentId || !channelId) { res.status(400).json({ error: 'agentId and channelId required' }); return }
  await assertTeacherRoomAccessible(channelId, companyId, userId)
  const workId = await activeWorkForControl(companyId, userId, agentId, channelId)
  if (!workId) { res.status(404).json({ error: 'no active run' }); return }
  await pool.query(`UPDATE agent_work_items SET cancel_requested_at=NOW(), updated_at=NOW() WHERE id=$1`, [workId])
  const { rows: bindings } = await pool.query<{ profile: Record<string, unknown> }>(
    `SELECT profile FROM im_channel_bindings WHERE channel_id=$1 AND company_id=$2`, [channelId, companyId],
  )
  await wukongClient().sendMessage(channelId, Number(bindings[0]?.profile.channelType ?? 2), userId, {
    version: 1, kind: 'tool_activity', clientMsgNo: `stop-${workId}-${randomUUID()}`,
    body: 'Learner requested Stop', refs: { workId, agentId },
    data: { stage: 'cancel_requested', suppressAgentWake: true },
  })
  res.json({ ok: true, workId })
}))

imRouter.post('/runs/steer', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  const agentId = String(req.body?.agentId ?? '').trim()
  const channelId = String(req.body?.channelId ?? '').trim()
  const text = String(req.body?.text ?? '').trim().slice(0, 4_000)
  if (!agentId || !channelId || !text) { res.status(400).json({ error: 'agentId, channelId and text required' }); return }
  await assertTeacherRoomAccessible(channelId, companyId, userId)
  const workId = await activeWorkForControl(companyId, userId, agentId, channelId)
  if (!workId) { res.status(404).json({ error: 'no active run' }); return }
  const steer = { id: randomUUID(), text, createdAt: new Date().toISOString() }
  await pool.query(
    `UPDATE agent_work_items SET steer_inputs=steer_inputs || $2::jsonb, updated_at=NOW() WHERE id=$1`,
    [workId, JSON.stringify([steer])],
  )
  const { rows: bindings } = await pool.query<{ profile: Record<string, unknown> }>(
    `SELECT profile FROM im_channel_bindings WHERE channel_id=$1 AND company_id=$2`, [channelId, companyId],
  )
  await wukongClient().sendMessage(channelId, Number(bindings[0]?.profile.channelType ?? 2), userId, {
    version: 1, kind: 'tool_activity', clientMsgNo: `steer-${workId}-${steer.id}`,
    body: 'Learner steered the active run', refs: { workId, agentId },
    data: { stage: 'steered', steerId: steer.id, suppressAgentWake: true },
  })
  res.json({ ok: true, workId, steerId: steer.id })
}))
