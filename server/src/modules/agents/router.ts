import { randomUUID, } from 'node:crypto'
import { Router } from 'express'
import { pool } from '../../db/pool.js'
import { requireCompanyRole } from '../../http/authorization.js'
import { HttpError } from '../../http/errors.js'
import { requireAuth, requireCompany, requireCompanyArtifactContext } from '../../http/request-context.js'
import { assertNotManagedPulse, assertPulseVisible } from '../../learning/visibility.js'
import { BUSY_STATUS_LEASE_MS } from '../../status.js'

export const agentsRouter = Router()
const api = agentsRouter

api.get('/participants', async (req, res) => {
  const { userId: me, companyId: tenant, projectId } = await requireCompanyArtifactContext(req)
  await pool.query(
    `UPDATE participants
        SET status = 'avail',
            status_updated_at = NOW()
      WHERE company_id = $1
        AND kind = 'agent'
        AND departed_at IS NULL
        AND status IN ('thinking', 'working', 'waiting')
        AND status_updated_at < NOW() - ($2::int * INTERVAL '1 millisecond')`,
    [tenant, BUSY_STATUS_LEASE_MS],
  )
  const { rows } = await pool.query<{
    id: string; kind: 'agent' | 'human'; name: string; role: string | null
    initial: string; avatarBg: string; avatarUrl: string | null
    status: string; statusUpdatedAt: string | null
    bio: string | null; tools: string[] | null; capabilities: string[] | null
    systemPrompt: string | null
    email: string | null; companySlug: string | null
    departedAt: string | null; managed: boolean; projectId: string | null; presetKey: string | null
  }>(
    `SELECT p.id, p.kind, p.name, p.role, p.initial,
            CASE WHEN p.kind = 'agent' THEN 'transparent' ELSE p.avatar_bg END AS "avatarBg",
            CASE WHEN p.kind = 'agent' THEN NULL ELSE p.avatar_url END AS "avatarUrl",
            p.status, p.status_updated_at AS "statusUpdatedAt",
            p.bio, p.tools, p.capabilities, p.system_prompt AS "systemPrompt",
            -- Email resolution differs by kind:
            --  - agents carry their own minted address on participants.email
            --  - humans don't have one there; surface their real auth email
            --    (users.email) ONLY for humans who are actually members of
            --    THIS company. The cm JOIN is the safety check — without it,
            --    a participant with kind='human' and an id that happens to
            --    match a user.id elsewhere would leak that user's email,
            --    which is wrong even if rare. Demo-seed humans (wei / maya
            --    with no user row) just get null email — fine, they're not
            --    real and can't receive mail anyway.
            COALESCE(
              p.email,
              CASE WHEN p.kind = 'human' AND cm.user_id IS NOT NULL THEN u.email END
            ) AS email,
            comp.slug AS "companySlug",
            p.departed_at AS "departedAt",p.preset_key AS "presetKey",
            EXISTS(
              SELECT 1 FROM learning_project_teacher_agents managed_pulse
               WHERE managed_pulse.agent_id=p.id AND managed_pulse.company_id=p.company_id
            ) AS managed,
            (SELECT managed_pulse.project_id FROM learning_project_teacher_agents managed_pulse
              WHERE managed_pulse.agent_id=p.id AND managed_pulse.company_id=p.company_id LIMIT 1) AS "projectId"
       FROM participants p
       JOIN companies comp ON comp.id = p.company_id
       LEFT JOIN company_members cm
              ON cm.user_id = p.id AND cm.company_id = p.company_id
       LEFT JOIN users u ON u.id = cm.user_id
      WHERE p.company_id = $1
        AND (
          NOT EXISTS (
            SELECT 1 FROM learning_project_teacher_agents pulse
             WHERE pulse.agent_id=p.id AND pulse.company_id=p.company_id
          )
          OR EXISTS (
            SELECT 1
              FROM learning_project_teacher_agents pulse
              JOIN courses pulse_course
                ON pulse_course.project_id=pulse.project_id AND pulse_course.company_id=pulse.company_id
              JOIN course_members pulse_teacher
                ON pulse_teacher.course_id=pulse_course.id AND pulse_teacher.company_id=pulse_course.company_id
               AND pulse_teacher.user_id=$3 AND pulse_teacher.role='teacher'
             WHERE pulse.agent_id=p.id AND pulse.company_id=p.company_id AND pulse.project_id=$2
          )
        )
        AND (
          p.kind = 'agent'
          OR EXISTS (
            SELECT 1
              FROM projects selected_project
              LEFT JOIN courses selected_course ON selected_course.project_id = selected_project.id
              LEFT JOIN course_members selected_member
                ON selected_member.course_id = selected_course.id AND selected_member.user_id = p.id
             WHERE selected_project.id = $2
               AND selected_project.company_id = p.company_id
               AND (selected_project.is_general = TRUE OR selected_member.user_id IS NOT NULL)
          )
        )
      ORDER BY p.kind DESC, p.name ASC`,
    [tenant, projectId, me],
  )
  // Compute deterministic addresses for agents who haven't been
  // lazy-minted yet — without this, the renderer's recipient picker hides
  // every fresh agent (their email column is NULL until first send/recv),
  // which is exactly wrong for "compose new email to an agent". The mint
  // itself stays lazy on the write path; this is just surfacing the
  // address that WILL be used.
  const { computeAgentAddress } = await import('../../email.js')
  const finalRows = rows.map((r) => {
    if (r.managed || r.email || r.kind !== 'agent' || !r.companySlug) {
      const { companySlug: _drop, ...rest } = r
      return r.managed ? { ...rest, email: null } : rest
    }
    const computed = computeAgentAddress(r.id, r.companySlug)
    const { companySlug: _drop, ...rest } = r
    return { ...rest, email: computed }
  })
  res.json(finalRows)
})

/* ============== Agent CRUD ============== */

interface AgentBody {
  id?: unknown; name?: unknown; role?: unknown
  systemPrompt?: unknown; bio?: unknown
  tools?: unknown; capabilities?: unknown
}
const AGENT_CAPABILITIES = new Set(['canvas', 'web', 'files', 'email', 'documents', 'calendar', 'knowledge'])
const DEFAULT_AGENT_CAPABILITIES = ['canvas', 'web', 'files', 'email', 'documents']
function readAgentBody(b: AgentBody): {
  id?: string; name?: string; role?: string
  systemPrompt?: string; bio?: string
  tools?: string[] | null
  capabilities?: string[]
} {
  const out: Record<string, unknown> = {}
  if (typeof b.id === 'string')           out.id = b.id.trim()
  if (typeof b.name === 'string')         out.name = b.name.trim()
  if (typeof b.role === 'string')         out.role = b.role.trim()
  if (typeof b.systemPrompt === 'string') out.systemPrompt = b.systemPrompt
  if (typeof b.bio === 'string')          out.bio = b.bio
  if (Array.isArray(b.tools))             out.tools = b.tools.map((x) => String(x))
  if (Array.isArray(b.capabilities)) {
    out.capabilities = [...new Set(b.capabilities.map(String).filter((x) => AGENT_CAPABILITIES.has(x)))]
  }
  return out as ReturnType<typeof readAgentBody>
}

/** Slugify a display name into a candidate agent id: lowercase ASCII
 *  letters/digits/hyphens, starts with a letter, capped at 24 chars.
 *  Falls back to `'agent'` when the name has no usable ASCII tail
 *  (e.g. an all-CJK / emoji name). Used by /agents POST to derive
 *  the agent id from the user-supplied name — users no longer enter
 *  an id directly, so we get to enforce shape AND global uniqueness
 *  invisibly. */
function slugifyAgentName(name: string): string {
  const lowered = name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  let slug = lowered
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 24)
  if (!/^[a-z]/.test(slug)) slug = `a-${slug}`.slice(0, 24)
  if (slug.length === 0) slug = 'agent'
  return slug
}

/** Pick a globally-unique agent id, preferring the slug of `name` and
 *  falling back to `${slug}-${random4}` if (and as many times as)
 *  needed. The participants table enforces global uniqueness on
 *  `id WHERE kind='agent'` via a partial unique index, so this loop
 *  + the INSERT race together can still 409 if a peer wins; the
 *  caller catches that and retries with a fresh suffix. */
async function pickUniqueAgentId(baseName: string): Promise<string> {
  const base = slugifyAgentName(baseName)
  const tryIds: string[] = [base]
  for (let i = 0; i < 8; i++) {
    tryIds.push(`${base}-${Math.random().toString(36).slice(2, 6)}`)
  }
  for (const candidate of tryIds) {
    const { rows } = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM participants WHERE id = $1) AS exists`,
      [candidate],
    )
    if (!rows[0].exists) return candidate
  }
  // Wildly unlikely with 8 random suffixes.
  throw new HttpError(500, 'could not pick a unique agent id — please retry')
}

api.post('/agents', async (req, res) => {
  // Agents are shared workspace identities — they speak on behalf of the
  // company, hold their own LLM budget, and can email out. Restricting
  // create to owners/admins matches every other "shared workspace
  // configuration" path (invites, project archive).
  const { userId: me, companyId: tenant } = await requireCompanyRole(req)
  const data = readAgentBody(req.body ?? {})
  if (!data.name || !data.name.trim()) { res.status(400).json({ error: 'name required' }); return }
  if (!data.systemPrompt || data.systemPrompt.trim().length < 10) {
    res.status(400).json({ error: 'systemPrompt required (at least 10 chars — describe the agent\'s style)' }); return
  }
  // The id is now SERVER-generated from the name (slugified) rather
  // than user-supplied — users can't accidentally cause cross-tenant
  // id collisions, and the same display name landing in two
  // workspaces still produces two distinct ids (the second one gets
  // a random suffix).
  const agentId = await pickUniqueAgentId(data.name)
  const initial = data.name.charAt(0).toUpperCase()
  const avatarBg = 'transparent'
  try {
    await pool.query(
      `INSERT INTO participants (id, kind, name, role, initial, avatar_bg, status, bio, tools, capabilities, system_prompt, company_id)
       VALUES ($1, 'agent', $2, $3, $4, $5, 'avail', $6, $7::jsonb, $8::jsonb, $9, $10)`,
      [agentId, data.name, data.role ?? '', initial, avatarBg, data.bio ?? '',
       JSON.stringify(['ipython']), JSON.stringify(data.capabilities ?? DEFAULT_AGENT_CAPABILITIES),
       data.systemPrompt, tenant],
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/duplicate key|participants_agent_id_unique/.test(msg)) {
      // Race window between pickUniqueAgentId's SELECT and the INSERT
      // — another POST squatted on this id. Client can retry.
      res.status(409).json({ error: 'agent id collision — please retry' })
    } else {
      res.status(500).json({ error: msg })
    }
    return
  }
  // Re-bind data.id for the rest of the handler so subsequent workspace
  // seeding and the response payload see it.
  data.id = agentId
  const { invalidatePersonaCache } = await import('../../agents/personas.js')
  invalidatePersonaCache()

  // Seed IDENTITY.md + SOUL.md at the workspace root. These are the
  // agent's self-definition — the system prompt loads them every turn
  // (see personas.ts:buildSystemPrompt). Agents can rewrite them via
  // `edit_file` / `write_file` as they evolve. We seed them with a
  // template based on the persona fields so the first wake-up isn't
  // identity-less.
  const identityBody = `# ${data.name}\n\n` +
      `**Role:** ${data.role ?? 'agent'}\n\n` +
      (data.bio ? `**Bio:**\n${data.bio}\n\n` : '') +
      `_This file is your identity. Edit it as you grow — what you write here_\n` +
      `_loads into your system prompt on every wake._\n`
    const soulBody = `# Soul of ${data.name}\n\n` +
      `## Voice\n\n` +
      `${data.systemPrompt}\n\n` +
      `## Principles\n\n` +
      `- Speak like a real person, not like a tech blog.\n` +
      `- Match the user's language.\n` +
      `- Save things worth remembering — they outlive any single conversation.\n\n` +
      `_This file is your voice + values. Edit it freely to evolve who you are._\n`
  await pool.query(
      `INSERT INTO agent_workspace (agent_id, path, body, company_id, updated_at)
       VALUES ($1, 'IDENTITY.md', $2, $3, NOW()),
              ($1, 'SOUL.md',    $4, $3, NOW())
       ON CONFLICT (agent_id, path) DO NOTHING`,
      [data.id, identityBody, tenant, soulBody],
  )

  // Auto-create a 1:1 direct conversation between the creator and the
  // new agent. Without this, the agent never appears in the user's
  // conversations list until they manually click "Chat" — and the Chat
  // button on the agent card stays disabled because no direct exists.
  // Same idempotent shape as `POST /conversations/direct`.
  await pool.query(
      `INSERT INTO conversations (id, kind, title, subtitle, members, pinned, tag, company_id)
       VALUES ($1, 'direct', $2, NULL, $3::jsonb, FALSE, NULL, $4)
       ON CONFLICT (id) DO NOTHING`,
      [`direct-${data.id}-${randomUUID().slice(0, 6)}`, data.name, JSON.stringify([me, data.id]), tenant],
    )
    // Counter row is required for sequence allocation on the first message.
  await pool.query(
      `INSERT INTO conversation_counters (conversation_id, next_sequence)
       SELECT id, 1 FROM conversations
       WHERE kind = 'direct' AND company_id = $2
         AND members @> to_jsonb(ARRAY[$1::text]) AND members @> to_jsonb(ARRAY[$3::text])
         AND jsonb_array_length(members) = 2
       ON CONFLICT (conversation_id) DO NOTHING`,
      [me, tenant, data.id],
  )

  res.status(201).json({ id: data.id })
})

api.put('/agents/:id', async (req, res) => {
  // Editing an Agent identity or capabilities changes a shared resource
  // every member talks to. Gate to owner/admin — same bar as creation.
  const { companyId: tenant } = await requireCompanyRole(req)
  const id = req.params.id
  await assertNotManagedPulse(id, tenant)
  const { rows: existing } = await pool.query<{ kind: string }>(
    `SELECT kind FROM participants WHERE id = $1 AND company_id = $2`, [id, tenant],
  )
  if (!existing[0]) { res.status(404).json({ error: 'not found' }); return }
  if (existing[0].kind !== 'agent') { res.status(400).json({ error: 'cannot edit non-agent participant' }); return }

  const data = readAgentBody(req.body ?? {})
  const sets: string[] = []
  const params: unknown[] = []
  const push = (col: string, val: unknown) => {
    params.push(val); sets.push(`${col} = $${params.length}`)
  }
  if (data.name !== undefined)         push('name', data.name)
  if (data.role !== undefined)         push('role', data.role)
  if (data.systemPrompt !== undefined) push('system_prompt', data.systemPrompt)
  if (data.bio !== undefined)          push('bio', data.bio)
  if (data.tools !== undefined)        push('tools', JSON.stringify(['ipython']))
  if (data.capabilities !== undefined) push('capabilities', JSON.stringify(data.capabilities))
  if (sets.length === 0) { res.status(400).json({ error: 'nothing to update' }); return }
  params.push(id, tenant)
  await pool.query(
    `UPDATE participants SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND company_id = $${params.length}`,
    params,
  )
  const { invalidatePersonaCache } = await import('../../agents/personas.js')
  invalidatePersonaCache(id)
  res.json({ ok: true })
})

/**
 * Off-board an agent (soft delete). Their memory / log / workspace / tasks are
 * preserved, their messages stay in conversation history. They stop being woken
 * by the scheduler and disappear from other agents' rosters. Use POST
 * /agents/:id/rehire to bring them back.
 */
api.delete('/agents/:id', async (req, res) => {
  // Off-boarding an agent silences it for the whole workspace and removes
  // it from every conversation's wake roster — destructive, owner/admin only.
  const { companyId: tenant } = await requireCompanyRole(req)
  const id = req.params.id
  await assertNotManagedPulse(id, tenant)
  const { rows: existing } = await pool.query<{ kind: string; departed_at: string | null }>(
    `SELECT kind, departed_at FROM participants WHERE id = $1 AND company_id = $2`, [id, tenant],
  )
  if (!existing[0]) { res.status(404).json({ error: 'not found' }); return }
  if (existing[0].kind !== 'agent') { res.status(400).json({ error: 'cannot off-board non-agent participant' }); return }
  if (existing[0].departed_at) { res.status(409).json({ error: 'already off-boarded' }); return }
  const { rows: ledGroups } = await pool.query<{ id: string; title: string }>(
    `SELECT id, title FROM conversations WHERE company_id = $1 AND kind = 'group' AND leader_id = $2 LIMIT 5`,
    [tenant, id],
  )
  if (ledGroups.length > 0) {
    res.status(409).json({
      error: `change the leader before off-boarding ${id}`,
      conversations: ledGroups,
    })
    return
  }
  await pool.query(
    `UPDATE participants
        SET departed_at = NOW(),
            status = 'resting',
            status_updated_at = NOW()
      WHERE id = $1 AND company_id = $2`,
    [id, tenant],
  )
  const { invalidatePersonaCache } = await import('../../agents/personas.js')
  invalidatePersonaCache(id)
  res.json({ ok: true, departedAt: new Date().toISOString() })
})

/** Re-hire an off-boarded agent — their memory and log come right back. */
api.post('/agents/:id/rehire', async (req, res) => {
  // Same gate as off-boarding (DELETE /agents/:id) — owner/admin only.
  const { companyId: tenant } = await requireCompanyRole(req)
  const id = req.params.id
  await assertNotManagedPulse(id, tenant)
  const { rows: existing } = await pool.query<{ kind: string; departed_at: string | null }>(
    `SELECT kind, departed_at FROM participants WHERE id = $1 AND company_id = $2`, [id, tenant],
  )
  if (!existing[0]) { res.status(404).json({ error: 'not found' }); return }
  if (existing[0].kind !== 'agent') { res.status(400).json({ error: 'cannot rehire non-agent participant' }); return }
  if (!existing[0].departed_at) { res.status(409).json({ error: 'agent is not off-boarded' }); return }
  await pool.query(
    `UPDATE participants
        SET departed_at = NULL,
            status = 'avail',
            status_updated_at = NOW()
      WHERE id = $1 AND company_id = $2`,
    [id, tenant],
  )
  const { invalidatePersonaCache } = await import('../../agents/personas.js')
  invalidatePersonaCache(id)
  res.json({ ok: true })
})

/* ============== Preferences + autonomy ============== */

api.get('/me/preferences', async (req, res) => {
  const me = requireAuth(req)
  const { rows } = await pool.query<{ prefs: Record<string, unknown> }>(
    `SELECT prefs FROM user_preferences WHERE user_id = $1`,
    [me],
  )
  res.json(rows[0]?.prefs ?? {})
})

api.put('/me/preferences', async (req, res) => {
  const me = requireAuth(req)
  const prefs = req.body ?? {}
  await pool.query(
    `INSERT INTO user_preferences (user_id, prefs, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (user_id) DO UPDATE
        SET prefs = EXCLUDED.prefs, updated_at = NOW()`,
    [me, JSON.stringify(prefs)],
  )
  res.json({ ok: true })
})

api.get('/agents/:id/autonomy', async (req, res) => {
  const { userId: me, companyId: tenant } = await requireCompany(req)
  await assertPulseVisible(req.params.id, tenant, me)
  const { rows: gate } = await pool.query(
    `SELECT 1 FROM participants WHERE id = $1 AND company_id = $2 LIMIT 1`,
    [req.params.id, tenant],
  )
  if (!gate[0]) { res.status(404).json({ error: 'not found' }); return }
  const { rows } = await pool.query(
    `SELECT user_id AS "userId", agent_id AS "agentId", threshold, pulled, led, dissolved
       FROM agent_autonomy WHERE user_id = $1 AND agent_id = $2`,
    [me, req.params.id],
  )
  res.json(rows[0] ?? { userId: me, agentId: req.params.id, threshold: 0.6, pulled: 0, led: 0, dissolved: 0 })
})

api.put('/agents/:id/autonomy', async (req, res) => {
  const { userId: me, companyId: tenant } = await requireCompany(req)
  await assertNotManagedPulse(req.params.id, tenant)
  const { rows: gate } = await pool.query(
    `SELECT 1 FROM participants WHERE id = $1 AND company_id = $2 LIMIT 1`,
    [req.params.id, tenant],
  )
  if (!gate[0]) { res.status(404).json({ error: 'not found' }); return }
  const threshold = Math.max(0, Math.min(1, Number(req.body?.threshold ?? 0.6)))
  await pool.query(
    `INSERT INTO agent_autonomy (user_id, agent_id, threshold)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, agent_id) DO UPDATE SET threshold = EXCLUDED.threshold`,
    [me, req.params.id, threshold],
  )
  res.json({ ok: true, threshold })
})

api.get('/agents/autonomy', async (req, res) => {
  const { userId: me, companyId: tenant } = await requireCompany(req)
  const { rows } = await pool.query(
    `SELECT a.user_id AS "userId", a.agent_id AS "agentId",
            a.threshold, a.pulled, a.led, a.dissolved
      FROM agent_autonomy a
       JOIN participants p ON p.id = a.agent_id
      WHERE a.user_id = $1 AND p.company_id = $2
        AND (
          NOT EXISTS (SELECT 1 FROM learning_project_teacher_agents pulse WHERE pulse.agent_id=p.id AND pulse.company_id=p.company_id)
          OR EXISTS (
            SELECT 1 FROM learning_project_teacher_agents pulse
              JOIN courses course ON course.project_id=pulse.project_id AND course.company_id=pulse.company_id
              JOIN course_members teacher ON teacher.course_id=course.id AND teacher.company_id=course.company_id
               AND teacher.user_id=$1 AND teacher.role='teacher'
             WHERE pulse.agent_id=p.id AND pulse.company_id=p.company_id
          )
        )`,
    [me, tenant],
  )
  res.json(rows)
})
