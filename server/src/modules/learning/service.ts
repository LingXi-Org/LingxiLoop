import { randomUUID, } from 'node:crypto'
import { Router } from 'express'
import {
  audit,
  gravatarUrlForEmail,
} from '../../auth.js'
import { pool } from '../../db/pool.js'
import { safe } from '../../http/async-handler.js'
import { HttpError } from '../../http/errors.js'
import { generateInvitationToken as generateInviteToken, hashInvitationToken as hashInviteToken } from '../../http/invitation-token.js'
import { assertCompanyHumanLimit, assertUserCompanyLimit, requireAuth, requireCompany, } from '../../http/request-context.js'
import { wukongClient } from '../../im/wukong.js'
import {
  ensureProjectNotebook,
  openNotebookEnabled,
  syncProjectNotebookMetadata,
} from '../../knowledge/service.js'
import { seedMemberDms } from '../../onboardCompany.js'
import { CH_DOC_ACCESS_REVOKED, publish, } from '../../redis.js'
import {
  closeTeacherRoomForCourse,
  ensureTeacherAgentForCourse,
  reactivateTeacherRoomForCourse,
  sendTeacherAgentWelcome,
  syncTeacherRoomMembers,
} from '../../learning/teacher-agent.js'
import { assertCanCreateCourse, buildCourseInviteUrl, requireCourseManager, syncCourseStudyRoom } from './policy.js'

export const learningServiceRoutes = Router()
const api = learningServiceRoutes

api.get('/courses', safe(async (req, res) => {
  const { userId: me, companyId } = await requireCompany(req)
  const { rows } = await pool.query(
    `SELECT course.id, course.company_id AS "companyId", course.created_by AS "createdBy",
            course.study_room_conversation_id AS "studyRoomId", course.created_at AS "createdAt",
            project.id AS "projectId", project.name, project.description, project.color,
            project.status, project.created_at AS "projectCreatedAt", project.updated_at AS "updatedAt",
            company_member.role AS "companyRole", course_member.role AS "courseRole",
            (SELECT COUNT(*)::int FROM course_members member WHERE member.course_id=course.id) AS "memberCount",
            (company_member.role IN ('owner','admin') OR course_member.role='teacher') AS "canManage"
       FROM courses course
       JOIN projects project ON project.id=course.project_id
       JOIN company_members company_member
         ON company_member.company_id=course.company_id AND company_member.user_id=$2
       LEFT JOIN course_members course_member
         ON course_member.course_id=course.id AND course_member.user_id=$2
      WHERE course.company_id=$1
        AND (company_member.role IN ('owner','admin') OR course_member.user_id IS NOT NULL)
      ORDER BY project.status ASC, project.updated_at DESC`,
    [companyId, me],
  )
  res.json(rows)
}))

api.post('/courses', safe(async (req, res) => {
  const { userId: me, companyId } = await requireCompany(req)
  await assertCanCreateCourse(me, companyId)
  const name = String(req.body?.name ?? '').trim().slice(0, 80)
  const description = String(req.body?.description ?? '').trim().slice(0, 1000)
  const color = req.body?.color == null ? '#5266d6' : String(req.body.color).slice(0, 200)
  if (!name) throw new HttpError(400, 'name required')
  const projectId = `p-${randomUUID().slice(0, 10)}`
  const courseId = `course-${randomUUID().slice(0, 12)}`
  const roomId = `course-room-${randomUUID().slice(0, 12)}`
  const client = await pool.connect()
  let pulseCreated = false
  try {
    await client.query('BEGIN')
    await client.query(
      `INSERT INTO projects (id,company_id,name,description,color,created_by,is_general)
       VALUES ($1,$2,$3,$4,$5,$6,FALSE)`,
      [projectId, companyId, name, description, color, me],
    )
    await client.query(
      `INSERT INTO courses (id,company_id,project_id,created_by) VALUES ($1,$2,$3,$4)`,
      [courseId, companyId, projectId, me],
    )
    await client.query(
      `INSERT INTO course_members (course_id,company_id,user_id,role) VALUES ($1,$2,$3,'teacher')`,
      [courseId, companyId, me],
    )
    const { rows: agents } = await client.query<{ id: string; preset_key: string }>(
      `SELECT id,preset_key FROM participants
        WHERE company_id=$1 AND kind='agent' AND preset_key IN ('nova','sage','milo','trace')
          AND departed_at IS NULL`, [companyId],
    )
    const memberIds = [me, ...agents.map((agent) => agent.id)]
    const leaderId = agents.find((agent) => agent.preset_key === 'nova')?.id ?? agents[0]?.id ?? null
    await client.query(
      `INSERT INTO conversations
         (id,kind,title,subtitle,topic,members,leader_id,pinned,tag,company_id,project_id)
       VALUES ($1,'group',$2,$3,$4,$5::jsonb,$6,TRUE,'course',$7,$8)`,
      [roomId, `${name} · Study Room`, `course · ${memberIds.length}`,
       '课程学习、讨论、练习与错因诊断', JSON.stringify(memberIds), leaderId, companyId, projectId],
    )
    await client.query(`INSERT INTO conversation_counters (conversation_id,next_sequence) VALUES ($1,1)`, [roomId])
    await client.query(`UPDATE courses SET study_room_conversation_id=$2 WHERE id=$1`, [courseId, roomId])
    pulseCreated = (await ensureTeacherAgentForCourse(courseId, client)).created
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally { client.release() }
  await syncCourseStudyRoom(courseId)
  await syncTeacherRoomMembers(courseId)
  if (pulseCreated) {
    await sendTeacherAgentWelcome(courseId).catch((error) => {
      console.warn('[course] Pulse welcome delivery failed', error)
    })
  }
  let knowledgeState: 'disabled' | 'ready' | 'failed' = openNotebookEnabled() ? 'ready' : 'disabled'
  if (openNotebookEnabled()) {
    try { await ensureProjectNotebook(projectId, companyId) }
    catch (error) { knowledgeState = 'failed'; console.warn('[course] notebook provisioning failed', error) }
  }
  await audit({ kind: 'course_create', userId: me, companyId, detail: { courseId, projectId, name } })
  res.status(201).json({
    id: courseId, companyId, projectId, name, description, color, status: 'active',
    createdBy: me, studyRoomId: roomId, courseRole: 'teacher', memberCount: 1,
    canManage: true, knowledgeState,
  })
}))

api.get('/courses/:id', safe(async (req, res) => {
  const courseId = String(req.params.id)
  const { userId: me, companyId } = await requireCompany(req)
  const { rows } = await pool.query(
    `SELECT course.id,course.company_id AS "companyId",course.project_id AS "projectId",
            course.created_by AS "createdBy",course.study_room_conversation_id AS "studyRoomId",
            project.name,project.description,project.color,project.status,
            company_member.role AS "companyRole",course_member.role AS "courseRole",
            (SELECT COUNT(*)::int FROM course_members member WHERE member.course_id=course.id) AS "memberCount",
            (company_member.role IN ('owner','admin') OR course_member.role='teacher') AS "canManage"
       FROM courses course JOIN projects project ON project.id=course.project_id
       JOIN company_members company_member ON company_member.company_id=course.company_id AND company_member.user_id=$3
       LEFT JOIN course_members course_member ON course_member.course_id=course.id AND course_member.user_id=$3
      WHERE course.id=$1 AND course.company_id=$2
        AND (company_member.role IN ('owner','admin') OR course_member.user_id IS NOT NULL)`,
    [courseId, companyId, me],
  )
  if (!rows[0]) throw new HttpError(404, 'course not found')
  res.json(rows[0])
}))

api.patch('/courses/:id', safe(async (req, res) => {
  const courseId = String(req.params.id)
  const manager = await requireCourseManager(req, courseId)
  if (manager.status !== 'active') throw new HttpError(409, 'archived courses are read-only')
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 80) : null
  const description = typeof req.body?.description === 'string' ? req.body.description.trim().slice(0, 1000) : null
  const color = typeof req.body?.color === 'string' ? req.body.color.slice(0, 200) : null
  if (name === null && description === null && color === null) throw new HttpError(400, 'nothing to update')
  if (name !== null && !name) throw new HttpError(400, 'name required')
  await pool.query(
    `UPDATE projects SET name=COALESCE($2,name),description=COALESCE($3,description),
            color=COALESCE($4,color),updated_at=NOW() WHERE id=$1`,
    [manager.projectId, name, description, color],
  )
  if (name) {
    await pool.query(
      `UPDATE conversations SET title=$2,updated_at=NOW()
        WHERE id=(SELECT study_room_conversation_id FROM courses WHERE id=$1)`,
      [courseId, `${name} · Study Room`],
    )
    await pool.query(
      `UPDATE participants participant SET name=$2,updated_at=NOW()
         FROM courses course
         JOIN learning_project_teacher_agents pulse
           ON pulse.project_id=course.project_id AND pulse.company_id=course.company_id
        WHERE course.id=$1 AND participant.id=pulse.agent_id AND participant.company_id=pulse.company_id`,
      [courseId, `Pulse · ${name}`.slice(0, 80)],
    )
    await syncCourseStudyRoom(courseId)
  }
  await syncProjectNotebookMetadata(manager.projectId).catch(() => undefined)
  await audit({ kind: 'course_update', userId: manager.userId, companyId: manager.companyId, detail: { courseId, name, description, color } })
  res.json({ ok: true })
}))

api.post('/courses/:id/archive', safe(async (req, res) => {
  const courseId = String(req.params.id)
  const manager = await requireCourseManager(req, courseId)
  const archive = req.body?.archive !== false
  await pool.query(
    archive
      ? `UPDATE projects SET status='archived',archived_at=NOW(),updated_at=NOW() WHERE id=$1`
      : `UPDATE projects SET status='active',archived_at=NULL,updated_at=NOW() WHERE id=$1`,
    [manager.projectId],
  )
  if (archive) await closeTeacherRoomForCourse(courseId)
  else await reactivateTeacherRoomForCourse(courseId)
  await syncProjectNotebookMetadata(manager.projectId).catch(() => undefined)
  await audit({ kind: archive ? 'course_archive' : 'course_unarchive', userId: manager.userId, companyId: manager.companyId, detail: { courseId } })
  res.json({ ok: true, status: archive ? 'archived' : 'active' })
}))

api.get('/courses/:id/members', safe(async (req, res) => {
  const courseId = String(req.params.id)
  await requireCourseManager(req, courseId)
  const { rows } = await pool.query(
    `SELECT users.id,users.display_name AS name,users.email,course_member.role,
            course_member.joined_at AS "joinedAt"
       FROM course_members course_member JOIN users ON users.id=course_member.user_id
      WHERE course_member.course_id=$1
      ORDER BY CASE course_member.role WHEN 'teacher' THEN 0 ELSE 1 END, course_member.joined_at`,
    [courseId],
  )
  res.json(rows)
}))

api.patch('/courses/:id/members/:userId', safe(async (req, res) => {
  const courseId = String(req.params.id)
  const targetId = String(req.params.userId)
  const manager = await requireCourseManager(req, courseId)
  if (manager.status !== 'active') throw new HttpError(409, 'archived courses are read-only')
  const role = String(req.body?.role ?? '')
  if (role !== 'teacher' && role !== 'learner') throw new HttpError(400, 'role must be teacher or learner')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Serialize teacher removals per course. Without the course-row lock, two
    // admins could concurrently demote the last two teachers after each sees
    // the other one, leaving the active course unmanaged.
    await client.query(`SELECT 1 FROM courses WHERE id=$1 FOR UPDATE`, [courseId])
    const { rows: member } = await client.query<{ role: string }>(
      `SELECT role FROM course_members WHERE course_id=$1 AND user_id=$2`, [courseId, targetId],
    )
    if (!member[0]) throw new HttpError(404, 'course member not found')
    if (member[0].role === 'teacher' && role === 'learner') {
      const { rows: count } = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM course_members WHERE course_id=$1 AND role='teacher'`, [courseId],
      )
      if ((count[0]?.count ?? 0) <= 1) throw new HttpError(409, 'an active course must keep at least one teacher')
    }
    await client.query(
      `UPDATE course_members SET role=$3,updated_at=NOW() WHERE course_id=$1 AND user_id=$2`,
      [courseId, targetId, role],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally { client.release() }
  await syncTeacherRoomMembers(courseId)
  await audit({ kind: 'course_member_role_update', userId: manager.userId, companyId: manager.companyId, detail: { courseId, targetId, role } })
  res.json({ ok: true, userId: targetId, role })
}))

api.delete('/courses/:id/members/:userId', safe(async (req, res) => {
  const courseId = String(req.params.id)
  const targetId = String(req.params.userId)
  const manager = await requireCourseManager(req, courseId)
  if (manager.status !== 'active') throw new HttpError(409, 'archived courses are read-only')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`SELECT 1 FROM courses WHERE id=$1 FOR UPDATE`, [courseId])
    const { rows: member } = await client.query<{ role: string }>(
      `SELECT role FROM course_members WHERE course_id=$1 AND user_id=$2`, [courseId, targetId],
    )
    if (!member[0]) throw new HttpError(404, 'course member not found')
    if (member[0].role === 'teacher') {
      const { rows: count } = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM course_members WHERE course_id=$1 AND role='teacher'`, [courseId],
      )
      if ((count[0]?.count ?? 0) <= 1) throw new HttpError(409, 'an active course must keep at least one teacher')
    }
    await client.query(`DELETE FROM course_members WHERE course_id=$1 AND user_id=$2`, [courseId, targetId])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally { client.release() }
  const { rows: changedChannels } = await pool.query<{ id: string; title: string; members: string[] }>(
    `UPDATE conversations conversation
        SET members=(SELECT COALESCE(jsonb_agg(value), '[]'::jsonb)
                       FROM jsonb_array_elements(conversation.members) value
                      WHERE value <> to_jsonb($2::text)),updated_at=NOW()
      WHERE conversation.project_id=$1 AND conversation.members @> to_jsonb(ARRAY[$2::text])
      RETURNING conversation.id,conversation.title,conversation.members`,
    [manager.projectId, targetId],
  )
  await pool.query(
    `UPDATE im_channel_bindings binding
        SET profile=jsonb_set(binding.profile,'{members}',conversation.members,TRUE),updated_at=NOW()
       FROM conversations conversation
      WHERE binding.channel_id=conversation.id AND conversation.project_id=$1`, [manager.projectId],
  )
  for (const channel of changedChannels) {
    void wukongClient().upsertChannel({ channelId: channel.id, channelType: 2, title: channel.title, members: channel.members }).catch(() => undefined)
  }
  const { revokeUserProjectDocumentSubscriptions } = await import('../../ws.js')
  await revokeUserProjectDocumentSubscriptions(targetId, manager.projectId)
  await publish(CH_DOC_ACCESS_REVOKED, {
    type: 'doc.access.revoked', companyId: manager.companyId,
    workspaceId: manager.projectId, userId: targetId,
  })
  await syncCourseStudyRoom(courseId)
  await syncTeacherRoomMembers(courseId)
  await audit({ kind: 'course_member_remove', userId: manager.userId, companyId: manager.companyId, detail: { courseId, targetId } })
  res.json({ ok: true })
}))

api.get('/courses/:id/invitations', safe(async (req, res) => {
  const courseId = String(req.params.id)
  await requireCourseManager(req, courseId)
  const { rows } = await pool.query(
    `SELECT invitation.token_hash AS id,invitation.email,invitation.role,invitation.note,
            invitation.max_uses AS "maxUses",invitation.use_count AS "useCount",
            invitation.created_at AS "createdAt",invitation.expires_at AS "expiresAt",
            invitation.revoked_at AS "revokedAt",invitation.last_accepted_at AS "lastAcceptedAt",
            invitation.last_accepted_by AS "lastAcceptedBy",invitation.invited_by AS "invitedBy",
            users.display_name AS "inviterName",
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'userId', recent.user_id, 'name', recent.display_name,
                'role', recent.role, 'acceptedAt', recent.accepted_at
              ) ORDER BY recent.accepted_at DESC)
              FROM (
                SELECT acceptance.user_id,accepted_user.display_name,acceptance.role,acceptance.accepted_at
                  FROM course_invitation_acceptances acceptance
                  LEFT JOIN users accepted_user ON accepted_user.id=acceptance.user_id
                 WHERE acceptance.token_hash=invitation.token_hash
                 ORDER BY acceptance.accepted_at DESC LIMIT 10
              ) recent
            ), '[]'::jsonb) AS acceptances,
            CASE WHEN invitation.revoked_at IS NOT NULL THEN 'revoked'
                 WHEN invitation.expires_at < NOW() THEN 'expired'
                 WHEN invitation.use_count >= invitation.max_uses THEN 'consumed'
                 ELSE 'active' END AS status
       FROM course_invitations invitation LEFT JOIN users ON users.id=invitation.invited_by
      WHERE invitation.course_id=$1 ORDER BY invitation.created_at DESC`,
    [courseId],
  )
  res.json(rows)
}))

api.post('/courses/:id/invitations', safe(async (req, res) => {
  const courseId = String(req.params.id)
  const manager = await requireCourseManager(req, courseId)
  if (manager.status !== 'active') throw new HttpError(409, 'archived courses cannot issue invitations')
  const emailRaw = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const email = emailRaw || null
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'invalid email')
  const role = String(req.body?.role ?? '')
  if (role !== 'teacher' && role !== 'learner') throw new HttpError(400, 'role must be teacher or learner')
  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 280) || null : null
  const expiresInDays = Number(req.body?.expiresInDays ?? 7)
  const maxUses = Number(req.body?.maxUses ?? 1)
  if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 30) {
    throw new HttpError(400, 'expiresInDays must be an integer between 1 and 30')
  }
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100) {
    throw new HttpError(400, 'maxUses must be an integer between 1 and 100')
  }
  if (email) {
    await pool.query(
      `UPDATE course_invitations SET revoked_at=NOW()
        WHERE course_id=$1 AND email=$2 AND revoked_at IS NULL AND expires_at>NOW() AND use_count<max_uses`,
      [courseId, email],
    )
  }
  const token = generateInviteToken()
  const tokenHash = hashInviteToken(token)
  const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000)
  await pool.query(
    `INSERT INTO course_invitations
       (token_hash,course_id,company_id,invited_by,email,role,note,max_uses,expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [tokenHash, courseId, manager.companyId, manager.userId, email, role, note, maxUses, expiresAt],
  )
  await audit({ kind: 'course_invitation_create', userId: manager.userId, companyId: manager.companyId, detail: { courseId, email, role, maxUses, expiresInDays } })
  res.status(201).json({
    id: tokenHash, token, url: buildCourseInviteUrl(token), email, role, note,
    maxUses, useCount: 0, createdAt: new Date().toISOString(), expiresAt: expiresAt.toISOString(), status: 'active',
  })
}))

api.delete('/courses/:id/invitations/:inviteId', safe(async (req, res) => {
  const courseId = String(req.params.id)
  const manager = await requireCourseManager(req, courseId)
  const { rowCount } = await pool.query(
    `UPDATE course_invitations SET revoked_at=NOW()
      WHERE token_hash=$1 AND course_id=$2 AND revoked_at IS NULL`,
    [String(req.params.inviteId), courseId],
  )
  if ((rowCount ?? 0) > 0) await audit({ kind: 'course_invitation_revoke', userId: manager.userId, companyId: manager.companyId, detail: { courseId, inviteId: req.params.inviteId } })
  res.json({ ok: true, revoked: (rowCount ?? 0) > 0 })
}))

api.get('/course-invitations/:token', safe(async (req, res) => {
  const tokenHash = hashInviteToken(String(req.params.token))
  const { rows } = await pool.query<{
    course_id: string; company_id: string; email: string | null; role: string; note: string | null
    max_uses: number; use_count: number; expires_at: string; revoked_at: string | null
    course_name: string; project_id: string; project_status: string; room_id: string | null
    company_name: string; company_slug: string; inviter_name: string | null
  }>(
    `SELECT invitation.course_id,invitation.company_id,invitation.email,invitation.role,invitation.note,
            invitation.max_uses,invitation.use_count,invitation.expires_at,invitation.revoked_at,
            project.name AS course_name,project.id AS project_id,project.status AS project_status,
            course.study_room_conversation_id AS room_id,company.name AS company_name,
            company.slug AS company_slug,users.display_name AS inviter_name
       FROM course_invitations invitation JOIN courses course ON course.id=invitation.course_id
       JOIN projects project ON project.id=course.project_id JOIN companies company ON company.id=course.company_id
       LEFT JOIN users ON users.id=invitation.invited_by WHERE invitation.token_hash=$1`,
    [tokenHash],
  )
  const invitation = rows[0]
  if (!invitation) { res.json({ status: 'not_found', kind: 'course' }); return }
  let status = invitation.revoked_at ? 'revoked'
    : new Date(invitation.expires_at).getTime() < Date.now() ? 'expired'
      : invitation.use_count >= invitation.max_uses ? 'consumed'
        : invitation.project_status !== 'active' ? 'archived' : 'valid'
  if (req.authUserId) {
    const { rows: viewer } = await pool.query<{ email: string; role: string | null }>(
      `SELECT users.email,course_member.role FROM users
       LEFT JOIN course_members course_member ON course_member.course_id=$2 AND course_member.user_id=users.id
       WHERE users.id=$1`, [req.authUserId, invitation.course_id],
    )
    if (viewer[0]?.role && (viewer[0].role === 'teacher' || invitation.role === viewer[0].role)) status = 'already_member'
    else if (invitation.email && viewer[0]?.email.toLowerCase() !== invitation.email) status = 'wrong_email'
  }
  res.json({
    kind: 'course', status,
    invitation: {
      role: invitation.role, email: invitation.email, note: invitation.note,
      expiresAt: new Date(invitation.expires_at).toISOString(), inviterName: invitation.inviter_name,
      company: { id: invitation.company_id, name: invitation.company_name, slug: invitation.company_slug },
      course: { id: invitation.course_id, name: invitation.course_name, projectId: invitation.project_id, studyRoomId: invitation.room_id },
    },
  })
}))

api.post('/course-invitations/:token/accept', safe(async (req, res) => {
  const me = requireAuth(req)
  const tokenHash = hashInviteToken(String(req.params.token))
  const { rows: userRows } = await pool.query<{ email: string; display_name: string; avatar_url: string | null; email_verified_at: string | null }>(
    `SELECT email,display_name,avatar_url,email_verified_at FROM users WHERE id=$1`, [me],
  )
  const user = userRows[0]
  if (!user) throw new HttpError(401, 'session points to missing user')
  if (!user.email_verified_at) throw new HttpError(403, 'a verified email is required to accept a course invitation')
  const client = await pool.connect()
  let result: { companyId: string; companyName: string; companySlug: string; companyRole: string; courseId: string; courseName: string; projectId: string; roomId: string | null; role: string; alreadyMember: boolean; joinedCompany: boolean }
  try {
    await client.query('BEGIN')
    // Invitations have independent token rows, so locking only the invitation
    // does not serialize two different links accepted by the same user. The
    // stable user row prevents a learner invite racing a teacher invite from
    // observing stale membership state (and also serializes auto-join).
    await client.query(`SELECT 1 FROM users WHERE id=$1 FOR UPDATE`, [me])
    const { rows } = await client.query<{
      company_id: string; course_id: string; email: string | null; role: 'teacher' | 'learner'
      max_uses: number; use_count: number; expires_at: string; revoked_at: string | null
      project_id: string; project_status: string; room_id: string | null; course_name: string
      company_name: string; company_slug: string
    }>(
      `SELECT invitation.company_id,invitation.course_id,invitation.email,invitation.role,
              invitation.max_uses,invitation.use_count,invitation.expires_at,invitation.revoked_at,
              course.project_id,project.status AS project_status,course.study_room_conversation_id AS room_id,
              project.name AS course_name,company.name AS company_name,company.slug AS company_slug
         FROM course_invitations invitation JOIN courses course ON course.id=invitation.course_id
         JOIN projects project ON project.id=course.project_id JOIN companies company ON company.id=course.company_id
        WHERE invitation.token_hash=$1 FOR UPDATE OF invitation`,
      [tokenHash],
    )
    const invitation = rows[0]
    if (!invitation) throw new HttpError(404, 'invitation not found')
    if (invitation.revoked_at) throw new HttpError(410, 'invitation revoked')
    if (new Date(invitation.expires_at).getTime() < Date.now()) throw new HttpError(410, 'invitation expired')
    if (invitation.project_status !== 'active') throw new HttpError(410, 'course archived')
    if (invitation.email && invitation.email !== user.email.toLowerCase()) throw new HttpError(403, `this invitation is reserved for ${invitation.email}`)
    const { rows: priorAcceptance } = await client.query(
      `SELECT 1 FROM course_invitation_acceptances WHERE token_hash=$1 AND user_id=$2`, [tokenHash, me],
    )
    const { rows: existingCompany } = await client.query<{ role: string }>(
      `SELECT role FROM company_members WHERE company_id=$1 AND user_id=$2`, [invitation.company_id, me],
    )
    const joinedCompany = !existingCompany[0]
    if (joinedCompany) {
      await assertUserCompanyLimit(me, client)
      await assertCompanyHumanLimit(invitation.company_id, client)
      await client.query(`INSERT INTO company_members (company_id,user_id,role) VALUES ($1,$2,'member')`, [invitation.company_id, me])
      await client.query(
        `INSERT INTO participants (id,company_id,kind,name,role,initial,avatar_bg,avatar_url,status,departed_at)
         VALUES ($1,$2,'human',$3,NULL,$4,'#FF8870',$5,'avail',NULL)
         ON CONFLICT (id,company_id) DO UPDATE SET name=EXCLUDED.name,avatar_url=EXCLUDED.avatar_url,status='avail',departed_at=NULL`,
        [me, invitation.company_id, user.display_name, user.display_name.charAt(0).toUpperCase(), user.avatar_url ?? gravatarUrlForEmail(user.email)],
      )
    }
    const { rows: membership } = await client.query<{ role: 'teacher' | 'learner' }>(
      `SELECT role FROM course_members WHERE course_id=$1 AND user_id=$2`, [invitation.course_id, me],
    )
    const existingRole = membership[0]?.role ?? null
    const isReplay = Boolean(priorAcceptance[0])
    if (isReplay && !existingRole) {
      throw new HttpError(410, 'this invitation was already accepted and no longer grants course access')
    }
    let effectiveRole: 'teacher' | 'learner' = isReplay
      ? existingRole!
      : existingRole === 'teacher' || invitation.role === 'teacher' ? 'teacher' : 'learner'
    const changesRole = !isReplay && (!existingRole || effectiveRole !== existingRole)
    if (!priorAcceptance[0] && changesRole && invitation.use_count >= invitation.max_uses) {
      throw new HttpError(410, 'invitation already used')
    }
    if (changesRole) {
      const { rows: upsertedMembership } = await client.query<{ role: 'teacher' | 'learner' }>(
        `INSERT INTO course_members (course_id,company_id,user_id,role)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (course_id,user_id) DO UPDATE SET
           role=CASE
             WHEN course_members.role='teacher' OR EXCLUDED.role='teacher' THEN 'teacher'
             ELSE 'learner'
           END,
           updated_at=NOW()
         RETURNING role`,
        [invitation.course_id, invitation.company_id, me, effectiveRole],
      )
      effectiveRole = upsertedMembership[0].role
    }
    if (!priorAcceptance[0] && changesRole) {
      await client.query(
        `INSERT INTO course_invitation_acceptances (token_hash,user_id,role) VALUES ($1,$2,$3)`,
        [tokenHash, me, effectiveRole],
      )
      await client.query(
        `UPDATE course_invitations SET use_count=use_count+1,last_accepted_at=NOW(),last_accepted_by=$2 WHERE token_hash=$1`,
        [tokenHash, me],
      )
    }
    await client.query('COMMIT')
    result = {
      companyId: invitation.company_id, companyName: invitation.company_name, companySlug: invitation.company_slug,
      companyRole: existingCompany[0]?.role ?? 'member',
      courseId: invitation.course_id, courseName: invitation.course_name, projectId: invitation.project_id,
      roomId: invitation.room_id, role: effectiveRole,
      alreadyMember: Boolean(existingRole) && !changesRole, joinedCompany,
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally { client.release() }
  await syncCourseStudyRoom(result.courseId)
  await syncTeacherRoomMembers(result.courseId)
  if (result.joinedCompany) await seedMemberDms({ companyId: result.companyId, memberId: me }).catch(() => undefined)
  await audit({ kind: 'course_invitation_accept', userId: me, companyId: result.companyId, detail: { courseId: result.courseId, role: result.role } })
  res.json({
    ok: true, alreadyMember: result.alreadyMember, joinedCompany: result.joinedCompany,
    company: { id: result.companyId, name: result.companyName, slug: result.companySlug, role: result.companyRole },
    course: { id: result.courseId, name: result.courseName, projectId: result.projectId, studyRoomId: result.roomId, role: result.role },
  })
}))
