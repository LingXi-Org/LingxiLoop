import { createHash, createHmac, randomUUID } from 'node:crypto'
import { Router, type Request, type Response, type NextFunction } from 'express'
import type { AuthedRequest } from '../auth.js'
import { pool } from '../db/pool.js'
import { executeActionWithLedger } from '../agent-os/control-plane.js'
import type { AgentWorkItem, HostAction } from '../agent-os/types.js'
import { wukongClient } from './wukong.js'
import type { ImChannelProfile } from './types.js'
import type { LingxiMessageV1 } from '../agent-os/types.js'
import { assertTeacherApprovalFresh } from '../learning/teacher-agent.js'

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

async function assertTeacherRoomAccess(channelId:string,userId:string,write=false):Promise<void>{
  const {rows}=await pool.query<{status:'active'|'closed';is_teacher:boolean}>(
    `SELECT tr.status,EXISTS(SELECT 1 FROM learning_course_memberships cm
       WHERE cm.course_id=tr.course_id AND cm.user_id=$2 AND cm.role='teacher') AS is_teacher
     FROM learning_course_teacher_rooms tr WHERE tr.conversation_id=$1`,[channelId,userId],
  )
  if(!rows[0])return
  if(!rows[0].is_teacher)throw Object.assign(new Error('teacher room requires current course teacher membership'),{status:403})
  if(write&&rows[0].status!=='active')throw Object.assign(new Error('archived teacher room is read-only'),{status:409})
}

function userImToken(uid: string): string {
  const secret = process.env.WUKONG_USER_TOKEN_SECRET ?? process.env.AGENT_OS_SERVICE_TOKEN ?? 'dev-wukong-user-token-secret'
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
  const { rows } = await pool.query<{
    channel_id: string; profile: Record<string, unknown>; leader_agent_id: string | null; preset_key: string | null
  }>(`SELECT b.channel_id, b.profile, b.leader_agent_id, b.preset_key
        FROM im_channel_bindings b JOIN conversations c ON c.id = b.channel_id
       WHERE b.company_id=$1 AND c.members @> to_jsonb(ARRAY[$2::text])
         AND (NOT EXISTS(SELECT 1 FROM learning_course_teacher_rooms tr WHERE tr.conversation_id=b.channel_id)
           OR EXISTS(SELECT 1 FROM learning_course_teacher_rooms tr
             JOIN learning_course_memberships cm ON cm.course_id=tr.course_id AND cm.user_id=$2 AND cm.role='teacher'
             WHERE tr.conversation_id=b.channel_id))
       ORDER BY b.created_at`, [companyId, userId])
  const conversations = await wukongClient().listConversations(userId)
  const state = new Map(conversations.map((item) => [`${item.channelId}:${item.channelType}`, item]))
  res.json(rows.map((row) => {
    const channelType = Number(row.profile.channelType ?? 2)
    const im = state.get(`${row.channel_id}:${channelType}`)
    const last = im?.lastMessage
    return ({
    id: row.channel_id,
    kind: row.profile.kind === 'direct' ? 'direct' : 'group',
    title: String(row.profile.title ?? row.channel_id),
    subtitle: null,
    topic: typeof row.profile.topic === 'string' ? row.profile.topic : null,
    members: Array.isArray(row.profile.members) ? row.profile.members.map(String) : [],
    leaderId: row.leader_agent_id,
    pinned: row.profile.pinned === true,
    muted: false,
    mutedUntil: null,
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
  await assertTeacherRoomAccess(channelId,userId)
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
  await assertTeacherRoomAccess(channelId,userId,true)
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
  await assertTeacherRoomAccess(String(req.params.id),userId)
  const { rows } = await pool.query<{ profile: Record<string, unknown> }>(
    `SELECT b.profile FROM im_channel_bindings b JOIN conversations c ON c.id=b.channel_id
      WHERE b.channel_id=$1 AND b.company_id=$2 AND c.members @> to_jsonb(ARRAY[$3::text])`, [req.params.id, companyId, userId],
  )
  if (!rows[0]) { res.status(404).json({ error: 'channel not found' }); return }
  await wukongClient().clearUnread(userId, String(req.params.id), Number(rows[0].profile.channelType ?? 2))
  res.json({ ok: true })
}))

imRouter.get('/approvals', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  const { rows } = await pool.query(
    `SELECT a.* FROM agent_os_approvals a JOIN conversations c ON c.id=a.channel_id
      WHERE a.company_id=$1 AND c.members @> to_jsonb(ARRAY[$2::text])
        AND (NOT EXISTS(SELECT 1 FROM learning_course_teacher_rooms tr WHERE tr.conversation_id=a.channel_id)
          OR EXISTS(SELECT 1 FROM learning_course_teacher_rooms tr
            JOIN learning_course_memberships cm ON cm.course_id=tr.course_id AND cm.user_id=$2 AND cm.role='teacher'
            WHERE tr.conversation_id=a.channel_id))
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
              JOIN learning_course_memberships cm ON cm.course_id=tr.course_id AND cm.user_id=$3 AND cm.role='teacher'
              WHERE tr.conversation_id=a.channel_id))
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
  const { companyId } = await identity(req)
  const { rows } = await pool.query(`SELECT * FROM agent_routines WHERE company_id=$1 ORDER BY created_at DESC`, [companyId])
  res.json(rows)
}))

imRouter.post('/routines/:id/pause', safe(async (req, res) => {
  const { companyId } = await identity(req)
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
