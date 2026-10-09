import { resolvePlanEntitlements } from '../access/public.js'
import { randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import { HttpError } from '../../http/errors.js'
import { auditInTransaction } from '../identity/public.js'
import { enqueueLearningEffect } from '../learning/effects-repository.js'
import { studyRoomState, syncStudyRoomMembers } from '../learning/reporting-repository.js'
import { enqueueMemberOnboardingEffect } from './effects-repository.js'

/** All invitation entry points run this inside their business transaction. */
export async function acceptEducationInvitation(db: Queryable, userId: string, tokenHash: string, kind: 'company' | 'project') {
  // ponytail: serialize admissions and departures; use ordered per-company locks if admission throughput requires it.
  await db.query(`SELECT pg_advisory_xact_lock(1282006535)`)
  const { rows: users } = await db.query<{
    email: string; display_name: string; avatar_url: string | null; email_verified_at: Date | null
    deleted_at: Date | null; suspended_at: Date | null; departed_at: Date | null
  }>(`SELECT email,display_name,avatar_url,email_verified_at,deleted_at,suspended_at,departed_at FROM users WHERE id=$1 FOR UPDATE`, [userId])
  const user = users[0]
  if (!user || user.deleted_at || user.suspended_at || !user.email_verified_at) throw new HttpError(403, 'verified, non-suspended account required')
  const revoking = await db.query(`SELECT 1 FROM company_onboarding_effects WHERE member_id=$1 AND kind='access.revoke' AND status<>'completed'`, [userId])
  if (revoking.rows[0]) throw new HttpError(409, 'departure cleanup in progress; retry shortly')
  const table = kind === 'company' ? 'company_invitations' : 'project_invitations'
  const { rows } = await db.query<{
    company_id: string; project_id?: string; is_admin?: boolean; email: string | null
    created_at: Date; expires_at: Date; revoked_at: Date | null; max_uses: number; use_count: number
    last_accepted_by: string | null
  }>(`SELECT * FROM ${table} WHERE token_hash=$1 FOR UPDATE`, [tokenHash])
  const invitation = rows[0]
  if (!invitation) throw new HttpError(404, 'invitation not found')
  const { rows: companies } = await db.query<{ id: string; name: string; slug: string; status: string }>(
    `SELECT id,name,slug,status FROM companies WHERE id=$1 FOR UPDATE`, [invitation.company_id])
  const company = companies[0]
  if (!company || !['ACTIVE', 'TRIAL'].includes(company.status)) throw new HttpError(410, 'company is not accepting members')
  if (invitation.email && invitation.email.toLowerCase() !== user.email.toLowerCase()) throw new HttpError(403, 'invitation email mismatch')
  const { rows: current } = await db.query<{ id: string; company_id: string; role: string; is_admin: boolean; period_id: string; status: string }>(
    `SELECT id,company_id,role,is_admin,period_id,status FROM company_memberships WHERE user_id=$1 AND ended_at IS NULL FOR UPDATE`, [userId])
  let member = current[0]
  const role = kind === 'company' ? 'TEACHER' : 'STUDENT'
  if (member && (member.company_id !== company.id || member.role !== role || member.status !== 'ACTIVE')) {
    throw new HttpError(409, 'account already belongs to another company or identity')
  }
  // This cutoff survives reactivation: an old shared link must never revive an ended grant.
  const { rows: departures } = await db.query<{ ended_at: Date | null }>(
    `SELECT MAX(period.ended_at) AS ended_at FROM company_membership_periods period
       JOIN company_memberships membership ON membership.id=period.membership_id WHERE membership.user_id=$1`, [userId])
  const departedAt = departures[0]?.ended_at
  if (departedAt && new Date(invitation.created_at) <= new Date(departedAt)) throw new HttpError(410, 'a new invitation is required after departure')
  let course: { id: string; name: string; projectId: string; studyRoomId: string | null; role: 'learner' } | undefined
  let alreadyMember = Boolean(member) && kind === 'company' && invitation.last_accepted_by === userId
  if (kind === 'project') {
    const { rows: courses } = await db.query<{ id: string; name: string; projectId: string; studyRoomId: string | null; status: string }>(
      `SELECT course.id,project.name,project.id AS "projectId",course.study_room_conversation_id AS "studyRoomId",project.status
         FROM courses course JOIN projects project ON project.id=course.project_id AND project.company_id=course.company_id
        WHERE course.company_id=$1 AND course.project_id=$2 FOR UPDATE OF course,project`, [company.id, invitation.project_id])
    if (!courses[0] || courses[0].status !== 'ACTIVE') throw new HttpError(410, 'course is not accepting students')
    course = { ...courses[0], role: 'learner' }
    const prior = await db.query(`SELECT 1 FROM project_invitation_acceptances acceptance
      JOIN project_memberships membership ON membership.project_id=$3 AND membership.user_id=acceptance.user_id
      WHERE acceptance.token_hash=$1 AND acceptance.user_id=$2 AND membership.status='ACTIVE'
        AND membership.company_period_id=$4`, [tokenHash, userId, invitation.project_id, member?.period_id ?? null])
    alreadyMember = Boolean(prior.rows[0])
  }
  if (!alreadyMember && (invitation.revoked_at || new Date(invitation.expires_at).getTime() <= Date.now() || invitation.use_count >= invitation.max_uses)) {
    throw new HttpError(410, 'invitation is no longer active')
  }
  const { rows: contracts } = await db.query<{ id: string; plan_id: string; seat_limit: number }>(
    `SELECT id,plan_id,seat_limit FROM education_contracts WHERE company_id=$1 AND status IN ('TRIAL','ACTIVE')
      AND starts_at<=NOW() AND ends_at>NOW() FOR UPDATE`, [company.id])
  const contract = contracts[0]
  if (!contract) throw new HttpError(410, 'active company contract required')
  if (course && !alreadyMember) {
    const entitlements = await resolvePlanEntitlements(db, contract.plan_id)
    const limit = entitlements.number('teacher.student_limit')
    const count = await db.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM project_memberships
      WHERE company_id=$1 AND project_id=$2 AND role='STUDENT' AND status='ACTIVE'`, [company.id,course.projectId])
    if (limit !== null && Number(count.rows[0]?.count ?? 0)>=limit) throw new HttpError(409, 'course student limit reached')
  }
  const joinedCompany = !member
  if (!member) {
    const seats = await db.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM organization_seats
      WHERE company_id=$1 AND status IN ('ACTIVE','SUSPENDED')`, [company.id])
    if (Number(seats.rows[0]?.count ?? 0)>=contract.seat_limit) throw new HttpError(409, 'company seat limit reached')
    const membershipId = `cm-${randomUUID()}`
    const periodId = randomUUID()
    const { rows: admitted } = await db.query<typeof member>(
      `INSERT INTO company_memberships(id,company_id,user_id,role,is_admin,status)
       VALUES($1,$2,$3,$4,$5,'ACTIVE') ON CONFLICT(company_id,user_id) DO UPDATE
         SET role=EXCLUDED.role,is_admin=EXCLUDED.is_admin,status='ACTIVE',ended_at=NULL,updated_at=NOW()
       RETURNING id,company_id,role,is_admin,period_id,status`, [membershipId, company.id, userId, role, invitation.is_admin ?? false])
    member = admitted[0]!
    await db.query(`INSERT INTO company_membership_periods(id,membership_id,role) VALUES($1,$2,$3)`, [periodId, member.id, role])
    await db.query(`UPDATE company_memberships SET period_id=$2 WHERE id=$1`, [member.id, periodId])
    member.period_id = periodId
    await db.query(`INSERT INTO organization_seats(id,company_id,contract_id,user_id,status) VALUES($1,$2,$3,$4,'ACTIVE')`,
      [randomUUID(),company.id,contract.id,userId])
    await db.query(`UPDATE users SET departed_at=NULL WHERE id=$1`, [userId])
    await db.query(`INSERT INTO participants(id,company_id,kind,name,initial,avatar_bg,avatar_url,status)
      VALUES($1,$2,'human',$3,upper(left($3,1)),'#FF8870',$4,'avail') ON CONFLICT(id,company_id) DO UPDATE
        SET name=EXCLUDED.name,avatar_url=EXCLUDED.avatar_url,status='avail',departed_at=NULL`, [userId, company.id, user.display_name, user.avatar_url])
    await enqueueMemberOnboardingEffect(db, company.id, userId)
  }
  if (kind === 'company' && invitation.is_admin && !alreadyMember) {
    await db.query(`UPDATE company_memberships SET is_admin=TRUE,updated_at=NOW() WHERE id=$1 AND role='TEACHER'`, [member.id])
    member.is_admin = true
  }
  if (course && !alreadyMember) {
    const prior = await db.query(`SELECT 1 FROM project_invitation_acceptances WHERE token_hash=$1 AND user_id=$2`, [tokenHash, userId])
    if (prior.rows[0]) throw new HttpError(410, 'this invitation no longer grants course access')
    await db.query(`INSERT INTO project_memberships(project_id,company_id,user_id,role,company_period_id)
      VALUES($1,$2,$3,'STUDENT',$4) ON CONFLICT(project_id,user_id) DO UPDATE
        SET role='STUDENT',status='ACTIVE',company_period_id=EXCLUDED.company_period_id,updated_at=NOW()`,
    [course.projectId, company.id, userId, member.period_id])
    await db.query(`INSERT INTO project_invitation_acceptances(token_hash,user_id) VALUES($1,$2)`, [tokenHash, userId])
    // Local authorization must be ready when admission returns; durable effects
    // reconcile the external channel independently after this transaction commits.
    const room = await studyRoomState(db, company.id, course.id)
    if (room?.room_id) await syncStudyRoomMembers(db, {
      courseId: course.id, companyId: company.id, roomId: room.room_id,
      title: room.title, topic: room.topic, leaderId: room.leader_id,
    })
    for (const effectKind of ['study_room.sync', 'teacher_room.sync', 'member_onboarding.seed'] as const) {
      await enqueueLearningEffect(db, { companyId: company.id, courseId: course.id, kind: effectKind, effectKey: userId, payload: { userId } })
    }
  }
  if (!alreadyMember) {
    await db.query(`UPDATE ${table} SET use_count=use_count+1,last_accepted_at=NOW(),last_accepted_by=$2 WHERE token_hash=$1`, [tokenHash, userId])
    await auditInTransaction(db, { kind: 'education_invitation_accept', userId, companyId: company.id,
      detail: { kind, periodId: member.period_id, courseId: course?.id } })
  }
  return { ok: true as const, alreadyMember, joinedCompany, company: { ...company, role: role.toLowerCase(), isAdmin: member.is_admin }, ...(course ? { course } : {}) }
}
