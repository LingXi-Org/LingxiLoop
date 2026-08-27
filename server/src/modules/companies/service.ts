import { createHash, randomUUID, } from 'node:crypto'
import { type Request, Router } from 'express'
import {
  type AuthedRequest,
  audit,
  gravatarUrlForEmail,
} from '../../auth.js'
import { pool } from '../../db/pool.js'
import { env } from '../../env.js'
import { safe } from '../../http/async-handler.js'
import { DEVTOOLS_ROLES } from '../../http/authorization.js'
import { HttpError } from '../../http/errors.js'
import { generateInvitationToken as generateInviteToken, hashInvitationToken as hashInviteToken } from '../../http/invitation-token.js'
import { assertCompanyHumanLimit, assertUserCompanyLimit, companyHumanSeatInfo, requireAuth } from '../../http/request-context.js'
import { wukongClient } from '../../im/wukong.js'
import { type InvitationEmailDelivery, sendInvitationEmail } from '../../invitation-email.js'
import { onboardStarterAgents, seedMemberDms } from '../../onboardCompany.js'

export const companiesServiceRoutes = Router()
const api = companiesServiceRoutes

/* ============== Companies (multi-tenant root) ============== */

api.get('/companies', async (req, res) => {
  const me = requireAuth(req)
  const { rows } = await pool.query<{
    id: string; runId: string; agentId: string; agentName: string; runStatus: string;
    kind: string; level: 'debug' | 'info' | 'warn' | 'error'; title: string; createdAt: Date
  }>(
    `SELECT c.id, c.name, c.slug, c.created_at AS "createdAt", cm.role
       FROM companies c
       JOIN company_members cm ON cm.company_id = c.id AND cm.user_id = $1
      ORDER BY cm.joined_at ASC`,
    [me],
  )
  res.json(rows)
})

api.post('/companies', async (req, res) => {
  const me = requireAuth(req)
  const name = String(req.body?.name ?? '').trim().slice(0, 80)
  if (!name) { res.status(400).json({ error: 'name required' }); return }
  await assertUserCompanyLimit(me)
  // Generate a slug from the name. Falls back to a random suffix on collision.
  const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'company'
  let slug = baseSlug
  let id = `co-${randomUUID().slice(0, 10)}`
  // Try inserting; on slug conflict, suffix with a short random tail and retry once.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await pool.query(
        `INSERT INTO companies (id, name, slug, owner_user_id) VALUES ($1, $2, $3, $4)`,
        [id, name, slug, me],
      )
      await pool.query(
        `INSERT INTO company_members (company_id, user_id, role) VALUES ($1, $2, 'owner')`,
        [id, me],
      )
      await pool.query(
        `INSERT INTO projects (id, company_id, name, description, color, created_by, is_general)
         VALUES ($1, $2, '通用工作区', '默认工作区与未归类内容', '#64748b', $3, TRUE)
         ON CONFLICT (id) DO NOTHING`,
        [`general-${createHash('md5').update(id).digest('hex').slice(0, 16)}`, id, me],
      )
      // Mirror the human-as-participant + starter-agents from signup, so a
      // brand-new workspace has the same teammates regardless of how it was
      // created. The participant insert is idempotent on (id) collision —
      // when the same user creates multiple companies, the second insert is
      // a no-op (their participant row stays attached to the first company).
      const { rows: meRow } = await pool.query<{ display_name: string; email: string }>(
        `SELECT display_name, email FROM users WHERE id = $1`, [me],
      )
      const displayName = meRow[0]?.display_name ?? me
      const gravatarUrl = meRow[0]?.email ? gravatarUrlForEmail(meRow[0].email) : null
      await pool.query(
        `INSERT INTO participants (id, kind, name, role, initial, avatar_bg, avatar_url, status, company_id)
         VALUES ($1, 'human', $2, NULL, $3, '#FF8870', $4, 'avail', $5)
         ON CONFLICT (id, company_id) DO NOTHING`,
        [me, displayName, displayName.charAt(0).toUpperCase(), gravatarUrl, id],
      )
      // Every workspace gets the six server-managed learning agents.
      try {
        await onboardStarterAgents(id)
      } catch (e) { console.warn('[companies] cloud/starter setup failed', e) }

      const ip = req.socket.remoteAddress ?? null
      const ua = (req.headers['user-agent'] as string | undefined) ?? null
      await audit({ kind: 'company_create', userId: me, companyId: id, ip, userAgent: ua, detail: { name, slug } })
      res.status(201).json({ id, name, slug, role: 'owner' })
      return
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!/duplicate key/.test(msg)) { res.status(500).json({ error: msg }); return }
      slug = `${baseSlug}-${randomUUID().slice(0, 4)}`
      id = `co-${randomUUID().slice(0, 10)}`
    }
  }
  res.status(500).json({ error: 'failed to create company after retries' })
})

api.get('/companies/:id', safe(async (req, res) => {
  const companyId = String(req.params.id)
  const me = requireAuth(req)
  const { rows } = await pool.query<{
    id: string; name: string; slug: string; description: string; role: string; created_at: string
  }>(
    `SELECT c.id, c.name, c.slug, c.description, cm.role, c.created_at
       FROM companies c JOIN company_members cm ON cm.company_id=c.id
      WHERE c.id=$1 AND cm.user_id=$2`,
    [companyId, me],
  )
  if (!rows[0]) throw new HttpError(404, 'company not found')
  res.json({
    id: rows[0].id, name: rows[0].name, slug: rows[0].slug,
    description: rows[0].description, role: rows[0].role, createdAt: rows[0].created_at,
  })
}))

api.patch('/companies/:id', safe(async (req, res) => {
  const companyId = String(req.params.id)
  const { userId: me } = await requireCompanyAdmin(req, companyId)
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 80) : null
  const description = typeof req.body?.description === 'string' ? req.body.description.trim().slice(0, 1000) : null
  if (name === null && description === null) throw new HttpError(400, 'nothing to update')
  if (name !== null && !name) throw new HttpError(400, 'name required')
  await pool.query(
    `UPDATE companies SET
       name=COALESCE($2,name), description=COALESCE($3,description), updated_at=NOW()
     WHERE id=$1`,
    [companyId, name, description],
  )
  await audit({ kind: 'company_update', userId: me, companyId, detail: { name, description } })
  const { rows } = await pool.query<{ id: string; name: string; slug: string; description: string }>(
    `SELECT id,name,slug,description FROM companies WHERE id=$1`, [companyId],
  )
  res.json(rows[0])
}))

api.get('/companies/:id/members', safe(async (req, res) => {
  const companyId = String(req.params.id)
  await requireCompanyAdmin(req, companyId)
  const { rows } = await pool.query(
    `SELECT u.id, u.display_name AS name, u.email, cm.role,
            cm.joined_at AS "joinedAt",
            COALESCE(jsonb_agg(jsonb_build_object(
              'courseId', course.id, 'name', project.name, 'role', course_member.role
            )) FILTER (WHERE course.id IS NOT NULL), '[]'::jsonb) AS courses
       FROM company_members cm
       JOIN users u ON u.id=cm.user_id
       LEFT JOIN course_members course_member
         ON course_member.company_id=cm.company_id AND course_member.user_id=cm.user_id
       LEFT JOIN courses course ON course.id=course_member.course_id
       LEFT JOIN projects project ON project.id=course.project_id
      WHERE cm.company_id=$1
      GROUP BY u.id,u.display_name,u.email,cm.role,cm.joined_at
      ORDER BY CASE cm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, cm.joined_at`,
    [companyId],
  )
  res.json(rows)
}))

api.patch('/companies/:id/members/:userId', safe(async (req, res) => {
  const companyId = String(req.params.id)
  const targetId = String(req.params.userId)
  const { userId: me } = await requireCompanyAdmin(req, companyId)
  const role = String(req.body?.role ?? '')
  if (role !== 'admin' && role !== 'member') throw new HttpError(400, 'role must be admin or member')
  if (targetId === me) throw new HttpError(409, 'you cannot change your own company role')
  const { rows } = await pool.query<{ role: string }>(
    `SELECT role FROM company_members WHERE company_id=$1 AND user_id=$2`, [companyId, targetId],
  )
  if (!rows[0]) throw new HttpError(404, 'member not found')
  if (rows[0].role === 'owner') throw new HttpError(409, 'the company owner cannot be demoted')
  await pool.query(`UPDATE company_members SET role=$3 WHERE company_id=$1 AND user_id=$2`, [companyId, targetId, role])
  await audit({ kind: 'company_member_role_update', userId: me, companyId, detail: { targetId, role } })
  res.json({ ok: true, userId: targetId, role })
}))

api.delete('/companies/:id/members/:userId', safe(async (req, res) => {
  const companyId = String(req.params.id)
  const targetId = String(req.params.userId)
  const { userId: me } = await requireCompanyAdmin(req, companyId)
  if (targetId === me) throw new HttpError(409, 'you cannot remove yourself')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: members } = await client.query<{ role: string }>(
      `SELECT role FROM company_members WHERE company_id=$1 AND user_id=$2 FOR UPDATE`,
      [companyId, targetId],
    )
    if (!members[0]) throw new HttpError(404, 'member not found')
    if (members[0].role === 'owner') throw new HttpError(409, 'the company owner cannot be removed')

    // Company membership deletion cascades into every course membership. Lock
    // all affected active Course rows in a stable order before counting, so
    // concurrent removals of different teachers cannot both validate against
    // the same pre-delete teacher count.
    const { rows: teachingCourses } = await client.query<{ id: string; name: string }>(
      `SELECT course.id,project.name
         FROM course_members member
         JOIN courses course ON course.id=member.course_id
         JOIN projects project ON project.id=course.project_id
        WHERE member.company_id=$1 AND member.user_id=$2 AND member.role='teacher'
          AND project.status='active'
        ORDER BY course.id
        FOR UPDATE OF course`,
      [companyId, targetId],
    )
    for (const course of teachingCourses) {
      const { rows: teacherCount } = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM course_members WHERE course_id=$1 AND role='teacher'`,
        [course.id],
      )
      if ((teacherCount[0]?.count ?? 0) <= 1) {
        throw new HttpError(409, `${course.name} must keep at least one teacher`)
      }
    }
    await client.query(`DELETE FROM company_members WHERE company_id=$1 AND user_id=$2`, [companyId, targetId])
    await client.query(
      `UPDATE participants SET departed_at=NOW(), status='offboarded'
        WHERE company_id=$1 AND id=$2 AND kind='human'`, [companyId, targetId],
    )
    await client.query(
      `UPDATE conversations conversation
          SET members=(SELECT COALESCE(jsonb_agg(value), '[]'::jsonb)
                         FROM jsonb_array_elements(conversation.members) value
                        WHERE value <> to_jsonb($2::text)), updated_at=NOW()
        WHERE company_id=$1 AND members @> to_jsonb(ARRAY[$2::text])`,
      [companyId, targetId],
    )
    await client.query(
      `UPDATE im_channel_bindings binding
          SET profile=jsonb_set(binding.profile, '{members}', conversation.members, TRUE)
         FROM conversations conversation
        WHERE binding.channel_id=conversation.id AND binding.company_id=$1`, [companyId],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally { client.release() }
  const { rows: channels } = await pool.query<{ channel_id: string; title: string; members: string[] }>(
    `SELECT binding.channel_id, COALESCE(binding.profile->>'title',binding.channel_id) AS title,
            conversation.members
       FROM im_channel_bindings binding JOIN conversations conversation ON conversation.id=binding.channel_id
      WHERE binding.company_id=$1`, [companyId],
  )
  for (const channel of channels) {
    void wukongClient().upsertChannel({ channelId: channel.channel_id, channelType: 2, title: channel.title, members: channel.members }).catch(() => undefined)
  }
  const { disconnectUserFromCompany } = await import('../../ws.js')
  disconnectUserFromCompany(targetId, companyId)
  await audit({ kind: 'company_member_remove', userId: me, companyId, detail: { targetId } })
  res.json({ ok: true })
}))

/* ============== Company invitations ============== */

const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7    // 7 days
const INVITE_ALLOWED_ROLES = new Set(['member', 'admin'])
const INVITE_MAX_LINK_USES = 100                  // hard ceiling on shareable links
interface InvitationRow {
  token_hash: string
  company_id: string
  invited_by: string
  email: string | null
  role: string
  note: string | null
  max_uses: number
  use_count: number
  created_at: string
  expires_at: string
  revoked_at: string | null
  last_accepted_at: string | null
  last_accepted_by: string | null
}

interface InvitationPreview {
  status: 'valid' | 'revoked' | 'expired' | 'consumed' | 'wrong_email' | 'already_member' | 'not_found'
  invitation?: {
    role: string
    email: string | null
    note: string | null
    expiresAt: string
    createdAt: string
    inviterName: string | null
    company: { id: string; name: string; slug: string }
    multiUse: boolean
  }
}

/** Resolve raw token → invite row + computed status. Does NOT require auth so
 *  the accept page can show the company name + inviter to logged-out users.
 *  Pass `viewerUserId` and `viewerEmailLower` for richer status (wrong_email,
 *  already_member). */
async function loadInvitation(args: {
  token: string
  viewerUserId?: string | null
  viewerEmailLower?: string | null
}): Promise<InvitationPreview> {
  const hash = hashInviteToken(args.token)
  const { rows } = await pool.query<InvitationRow & {
    company_name: string; company_slug: string; inviter_name: string | null
  }>(
    `SELECT i.token_hash, i.company_id, i.invited_by, i.email, i.role, i.note,
            i.max_uses, i.use_count, i.created_at, i.expires_at, i.revoked_at,
            i.last_accepted_at, i.last_accepted_by,
            c.name AS company_name, c.slug AS company_slug,
            u.display_name AS inviter_name
       FROM company_invitations i
       JOIN companies c ON c.id = i.company_id
       LEFT JOIN users u ON u.id = i.invited_by
      WHERE i.token_hash = $1`,
    [hash],
  )
  if (rows.length === 0) return { status: 'not_found' }
  const r = rows[0]
  const baseInvite = {
    role: r.role,
    email: r.email,
    note: r.note,
    expiresAt: new Date(r.expires_at).toISOString(),
    createdAt: new Date(r.created_at).toISOString(),
    inviterName: r.inviter_name,
    company: { id: r.company_id, name: r.company_name, slug: r.company_slug },
    multiUse: r.max_uses > 1,
  }
  if (r.revoked_at) return { status: 'revoked', invitation: baseInvite }
  if (new Date(r.expires_at).getTime() < Date.now()) return { status: 'expired', invitation: baseInvite }
  if (r.use_count >= r.max_uses) return { status: 'consumed', invitation: baseInvite }
  if (args.viewerUserId) {
    const { rows: mem } = await pool.query(
      `SELECT 1 FROM company_members WHERE company_id = $1 AND user_id = $2 LIMIT 1`,
      [r.company_id, args.viewerUserId],
    )
    if (mem[0]) return { status: 'already_member', invitation: baseInvite }
  }
  if (r.email && args.viewerEmailLower && r.email.toLowerCase() !== args.viewerEmailLower) {
    return { status: 'wrong_email', invitation: baseInvite }
  }
  return { status: 'valid', invitation: baseInvite }
}

/** Require that the caller is owner / admin of the company in question. */
async function requireCompanyAdmin(req: Request & AuthedRequest, companyId: string): Promise<{ userId: string; role: string }> {
  const me = requireAuth(req)
  const { rows } = await pool.query<{ role: string }>(
    `SELECT role FROM company_members WHERE company_id = $1 AND user_id = $2 LIMIT 1`,
    [companyId, me],
  )
  if (rows.length === 0) throw new HttpError(403, 'not a member of this company')
  if (!DEVTOOLS_ROLES.has(rows[0].role)) {
    throw new HttpError(403, 'only owners and admins can manage invitations')
  }
  return { userId: me, role: rows[0].role }
}

/** Build the public-facing accept URL for an invite — always an https web
 *  origin (e.g. https://loop.example.com/invite/<token>). The web bundle hosted
 *  there has its API origin baked in at build time (VITE_LINGXILOOP_API_BASE), so
 *  the link is self-routing: any recipient who opens it lands on the right
 *  API automatically, even from Electron (the OS hands https URLs to the
 *  default browser). We deliberately do NOT mint lingxiloop:// deep links — each
 *  API server is tied to exactly one web origin, so an `?api=` query param
 *  would be redundant. */
function buildInviteUrl(token: string): string {
  const base = (env.INVITE_BASE_URL || env.AUTH_DONE_URL).replace(/\/+$/, '')
  return `${base}/invite/${encodeURIComponent(token)}`
}

/** List invitations for a company. Owners / admins only. Returns the
 *  most-recent first; includes both active and historical (revoked / expired
 *  / consumed) so the UI can show "X people redeemed this link". The raw
 *  token is never re-returned after creation — only the URL once at create
 *  time. */
api.get('/companies/:id/invitations', safe(async (req, res) => {
  const companyId = String(req.params.id)
  await requireCompanyAdmin(req, companyId)
  const { rows } = await pool.query<{
    token_hash: string; email: string | null; role: string; note: string | null
    max_uses: number; use_count: number; created_at: string; expires_at: string
    revoked_at: string | null; last_accepted_at: string | null
    last_accepted_by: string | null; invited_by: string
    inviter_name: string | null
  }>(
    `SELECT i.token_hash, i.email, i.role, i.note, i.max_uses, i.use_count,
            i.created_at, i.expires_at, i.revoked_at,
            i.last_accepted_at, i.last_accepted_by, i.invited_by,
            u.display_name AS inviter_name
       FROM company_invitations i
       LEFT JOIN users u ON u.id = i.invited_by
      WHERE i.company_id = $1
      ORDER BY i.created_at DESC
      LIMIT 200`,
    [companyId],
  )
  const now = Date.now()
  res.json(rows.map((r) => {
    const expired = new Date(r.expires_at).getTime() < now
    const consumed = r.use_count >= r.max_uses
    const status = r.revoked_at ? 'revoked'
      : expired ? 'expired'
      : consumed ? 'consumed'
      : 'active'
    return {
      // Stable, non-secret identifier the UI uses to revoke. Truncated hash
      // is fine here — we look invites up by the full hash, which the
      // revoke endpoint accepts.
      id: r.token_hash,
      email: r.email,
      role: r.role,
      note: r.note,
      maxUses: r.max_uses,
      useCount: r.use_count,
      createdAt: new Date(r.created_at).toISOString(),
      expiresAt: new Date(r.expires_at).toISOString(),
      revokedAt: r.revoked_at ? new Date(r.revoked_at).toISOString() : null,
      lastAcceptedAt: r.last_accepted_at ? new Date(r.last_accepted_at).toISOString() : null,
      lastAcceptedBy: r.last_accepted_by,
      invitedBy: r.invited_by,
      inviterName: r.inviter_name,
      status,
    }
  }))
}))

/** Create a new invitation. Body: { email?, role?, note?, multiUse? }.
 *  When `email` is provided the invite is single-use and locked to that
 *  email (case-insensitive). When omitted (or `multiUse: true`), a
 *  shareable link is minted with max_uses = 100 by default.
 *  Returns the RAW token + URL exactly ONCE — the server stores only the
 *  hash, so this is the only chance to copy the link. */
api.post('/companies/:id/invitations', safe(async (req, res) => {
  const companyId = String(req.params.id)
  const { userId: me } = await requireCompanyAdmin(req, companyId)
  const body = req.body ?? {}
  const rawEmail = typeof body.email === 'string' ? body.email.trim() : ''
  const email = rawEmail ? rawEmail.toLowerCase() : null
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'invalid email' }); return
  }
  const role = typeof body.role === 'string' && INVITE_ALLOWED_ROLES.has(body.role)
    ? body.role : 'member'
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 280) || null : null
  const multiUse = body.multiUse === true || (!email && body.maxUses !== 1)
  const requestedMaxUses = Number(body.maxUses ?? (email ? 1 : INVITE_MAX_LINK_USES))
  let maxUses = email
    ? 1
    : Math.max(1, Math.min(INVITE_MAX_LINK_USES, Number.isFinite(requestedMaxUses) ? requestedMaxUses : INVITE_MAX_LINK_USES))
  void multiUse  // referenced for clarity; maxUses already encodes the semantic

  // Email-targeted invites: refuse if the email already belongs to a
  // member (avoid spamming/revoke-loop in the UI). We don't refuse for
  // link invites — link reuse is the whole point.
  if (email) {
    const { rows: existing } = await pool.query(
      `SELECT 1 FROM company_members cm
         JOIN users u ON u.id = cm.user_id
        WHERE cm.company_id = $1 AND LOWER(u.email) = $2
        LIMIT 1`,
      [companyId, email],
    )
    if (existing[0]) {
      res.status(409).json({ error: 'that email is already a member of this workspace' })
      return
    }
    // Also collapse duplicate ACTIVE invites — re-issuing for the same email
    // revokes the prior one so the recipient only ever has one live link.
    await pool.query(
      `UPDATE company_invitations
          SET revoked_at = NOW()
        WHERE company_id = $1 AND email = $2
          AND revoked_at IS NULL AND expires_at > NOW()
          AND use_count < max_uses`,
      [companyId, email],
    )
  }

  const humanSeats = await companyHumanSeatInfo(companyId)
  const remaining = humanSeats.limit - humanSeats.used
  if (remaining <= 0) {
    throw new HttpError(403, `${humanSeats.tier} tier workspaces can have at most ${humanSeats.limit} human members`)
  }
  maxUses = Math.min(maxUses, remaining)

  const token = generateInviteToken()
  const tokenHash = hashInviteToken(token)
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS)
  await pool.query(
    `INSERT INTO company_invitations
       (token_hash, company_id, invited_by, email, role, note, max_uses, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [tokenHash, companyId, me, email, role, note, maxUses, expiresAt],
  )
  const ip = req.socket.remoteAddress ?? null
  const ua = (req.headers['user-agent'] as string | undefined) ?? null
  await audit({
    kind: 'invitation_create',
    userId: me, companyId, ip, userAgent: ua,
    detail: { email, role, maxUses, note: note ?? undefined },
  })

  // Optional: send the invitation email on the inviter's behalf. Only
  // valid when the invite is email-locked (no recipient to send to for
  // shareable link invites). Failures are reported back via emailDelivery
  // but do NOT fail the create — the invite row is already persisted and
  // the inviter has the URL on screen to share manually.
  let emailDelivery: InvitationEmailDelivery | null = null
  if (body.sendEmail === true && email) {
    const inviteUrl = buildInviteUrl(token)
    const { rows: meRows } = await pool.query<{ email: string; display_name: string }>(
      `SELECT email, display_name FROM users WHERE id = $1`, [me],
    )
    const { rows: coRows } = await pool.query<{ name: string }>(
      `SELECT name FROM companies WHERE id = $1`, [companyId],
    )
    const inviter = meRows[0]
    const company = coRows[0]
    if (inviter && company) {
      emailDelivery = await sendInvitationEmail({
        to: email,
        inviterName: inviter.display_name || inviter.email,
        inviterEmail: inviter.email,
        companyName: company.name,
        role,
        note,
        inviteUrl,
      })
    } else {
      emailDelivery = { attempted: false, ok: false, error: 'inviter or company row missing', skipped: null }
    }
  }

  res.status(201).json({
    id: tokenHash,
    token,
    url: buildInviteUrl(token),
    email,
    role,
    note,
    maxUses,
    useCount: 0,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
    status: 'active',
    emailDelivery,
  })
}))

/** Revoke an invitation. The id IS the token hash returned in the list /
 *  create responses. Idempotent — revoking a non-existent / already-revoked
 *  invite still returns 200 (so the UI doesn't have to dance around races). */
api.delete('/companies/:id/invitations/:inviteId', safe(async (req, res) => {
  const companyId = String(req.params.id)
  const inviteId = String(req.params.inviteId)
  const { userId: me } = await requireCompanyAdmin(req, companyId)
  const { rowCount } = await pool.query(
    `UPDATE company_invitations
        SET revoked_at = NOW()
      WHERE token_hash = $1 AND company_id = $2 AND revoked_at IS NULL`,
    [inviteId, companyId],
  )
  if ((rowCount ?? 0) > 0) {
    const ip = req.socket.remoteAddress ?? null
    const ua = (req.headers['user-agent'] as string | undefined) ?? null
    await audit({
      kind: 'invitation_revoke',
      userId: me, companyId, ip, userAgent: ua,
      detail: { inviteId },
    })
  }
  res.json({ ok: true, revoked: (rowCount ?? 0) > 0 })
}))

/** Public preview — no auth required. The accept screen calls this on mount
 *  to show "<inviter> invited you to <company>" before sign-in. If the
 *  caller IS signed in, we also surface `already_member` / `wrong_email`
 *  so the UI can show the right CTA. */
api.get('/invitations/:token', safe(async (req, res) => {
  const token = String(req.params.token)
  if (!token || token.length < 8) { res.status(400).json({ error: 'bad token' }); return }
  let viewerEmail: string | null = null
  if (req.authUserId) {
    const { rows } = await pool.query<{ email: string }>(
      `SELECT email FROM users WHERE id = $1`, [req.authUserId],
    )
    viewerEmail = rows[0]?.email?.toLowerCase() ?? null
  }
  const preview = await loadInvitation({
    token,
    viewerUserId: req.authUserId ?? null,
    viewerEmailLower: viewerEmail,
  })
  res.json(preview)
}))

/** Accept an invitation. Auth required — the joiner must already have a
 *  LingxiLoop account (sign in / sign up via OAuth first). Atomically:
 *    1. Re-checks the invite state under FOR UPDATE so two simultaneous
 *       redemptions on a single-use invite can't both win.
 *    2. Inserts a company_members row (idempotent on conflict).
 *    3. Mirrors the human as a participant in the target company.
 *    4. Bumps use_count + last_accepted_at/by.
 *  Then (post-commit, best-effort) seeds direct chats without changing the
 *  fixed membership of Study Room or Lab. Returns the company summary the
 *  client adds to the switcher list. */
api.post('/invitations/:token/accept', safe(async (req, res) => {
  const me = requireAuth(req)
  const token = String(req.params.token)
  if (!token || token.length < 8) { res.status(400).json({ error: 'bad token' }); return }
  const tokenHash = hashInviteToken(token)
  const { rows: userRow } = await pool.query<{ email: string; display_name: string; avatar_url: string | null }>(
    `SELECT email, display_name, avatar_url FROM users WHERE id = $1`, [me],
  )
  if (!userRow[0]) { res.status(401).json({ error: 'session points to missing user' }); return }
  const viewerEmail = userRow[0].email.toLowerCase()
  const displayName = userRow[0].display_name
  // Reuse the user's OAuth-mirrored avatar (stamped on users.avatar_url at
  // signup) so they show up in the inviter's workspace with the same face
  // they have everywhere else. Fall back to gravatar for users who pre-date
  // the optional avatar_url column.
  const userAvatar = userRow[0].avatar_url ?? gravatarUrlForEmail(userRow[0].email)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<InvitationRow>(
      `SELECT token_hash, company_id, invited_by, email, role, note,
              max_uses, use_count, created_at, expires_at, revoked_at,
              last_accepted_at, last_accepted_by
         FROM company_invitations
        WHERE token_hash = $1
        FOR UPDATE`,
      [tokenHash],
    )
    if (rows.length === 0) {
      await client.query('ROLLBACK')
      res.status(404).json({ error: 'invitation not found' }); return
    }
    const inv = rows[0]
    if (inv.revoked_at) {
      await client.query('ROLLBACK')
      res.status(410).json({ error: 'invitation revoked' }); return
    }
    if (new Date(inv.expires_at).getTime() < Date.now()) {
      await client.query('ROLLBACK')
      res.status(410).json({ error: 'invitation expired' }); return
    }
    if (inv.use_count >= inv.max_uses) {
      await client.query('ROLLBACK')
      res.status(410).json({ error: 'invitation already used' }); return
    }
    if (inv.email && inv.email.toLowerCase() !== viewerEmail) {
      await client.query('ROLLBACK')
      res.status(403).json({
        error: `this invitation is reserved for ${inv.email} — sign in with that email to accept`,
      }); return
    }

    // Idempotent membership upsert — if already a member, decline to
    // double-bump usage but still return success so the client can route
    // them into the workspace.
    const { rows: existingMembership } = await client.query(
      `SELECT 1 FROM company_members WHERE company_id = $1 AND user_id = $2 LIMIT 1`,
      [inv.company_id, me],
    )
    if (existingMembership[0]) {
      await client.query('ROLLBACK')
      const { rows: meta } = await pool.query<{ name: string; slug: string; role: string }>(
        `SELECT c.name, c.slug, cm.role
           FROM companies c JOIN company_members cm
             ON cm.company_id = c.id AND cm.user_id = $2
          WHERE c.id = $1`,
        [inv.company_id, me],
      )
      res.json({
        ok: true,
        alreadyMember: true,
        company: {
          id: inv.company_id,
          name: meta[0]?.name ?? '',
          slug: meta[0]?.slug ?? '',
          role: meta[0]?.role ?? 'member',
        },
      })
      return
    }

    await assertUserCompanyLimit(me, client)
    await assertCompanyHumanLimit(inv.company_id, client)

    await client.query(
      `INSERT INTO company_members (company_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (company_id, user_id) DO NOTHING`,
      [inv.company_id, me, inv.role],
    )

    // Mirror the human as a participant in the target company so they
    // appear in conversation member lists and avatar grids. Idempotent
    // on the (id, company_id) composite PK.
    await client.query(
      `INSERT INTO participants (id, kind, name, role, initial, avatar_bg, avatar_url, status, company_id)
       VALUES ($1, 'human', $2, NULL, $3, '#FF8870', $4, 'avail', $5)
       ON CONFLICT (id, company_id) DO NOTHING`,
      [me, displayName, displayName.charAt(0).toUpperCase(),
       userAvatar, inv.company_id],
    )

    await client.query(
      `UPDATE company_invitations
          SET use_count = use_count + 1,
              last_accepted_at = NOW(),
              last_accepted_by = $2
        WHERE token_hash = $1`,
      [tokenHash, me],
    )
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK').catch(() => { /* swallow */ })
    throw e
  } finally {
    client.release()
  }

  // Post-commit fan-out. Built-in learning rooms keep fixed membership;
  // invited people get direct conversations without joining a hidden room.
  const { rows: invRow } = await pool.query<{ company_id: string; role: string; invited_by: string }>(
    `SELECT company_id, role, invited_by FROM company_invitations WHERE token_hash = $1`,
    [tokenHash],
  )
  const inv = invRow[0]
  if (inv) {
    // Seed 1:1 DMs with every existing teammate (agents + humans) so the
    // invitee's sidebar matches the owner's experience — they can click any
    // colleague directly without changing the two built-in learning rooms.
    try { await seedMemberDms({ companyId: inv.company_id, memberId: me }) }
    catch (e) { console.warn('[invite] seed member DMs failed', e) }
  }

  const { rows: companyRow } = await pool.query<{ name: string; slug: string; role: string }>(
    `SELECT c.name, c.slug, cm.role
       FROM companies c JOIN company_members cm
         ON cm.company_id = c.id AND cm.user_id = $2
      WHERE c.id = $1`,
    [inv?.company_id ?? '', me],
  )
  const ip = req.socket.remoteAddress ?? null
  const ua = (req.headers['user-agent'] as string | undefined) ?? null
  await audit({
    kind: 'invitation_accept',
    userId: me, companyId: inv?.company_id ?? null, ip, userAgent: ua,
    detail: { invitedBy: inv?.invited_by, role: inv?.role },
  })
  res.json({
    ok: true,
    alreadyMember: false,
    company: {
      id: inv?.company_id ?? '',
      name: companyRow[0]?.name ?? '',
      slug: companyRow[0]?.slug ?? '',
      role: companyRow[0]?.role ?? 'member',
    },
  })
}))

/* ============== Courses ============== */
