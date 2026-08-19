/**
 * Auto-onboarding for fresh companies.
 *
 * When a new company is created (signup or POST /companies), we drop in a
 * six-role learning team so the workspace doesn't feel empty. Each
 * agent has a thoughtful persona — different roles, different voices, so a
 * brand-new user has actual teammates to talk to.
 *
 * Constraint: participants.id is globally unique (single-column PK), so the
 * FIRST tenant on a fresh DB gets clean ids ("nova", "sage", …); later
 * tenants get suffixed ids ("nova-2x4f", …). Display names stay clean.
 */
import { pool } from './db/pool.js'
import { invalidatePersonaCache } from './agents/personas.js'
import { randomUUID } from 'node:crypto'
import { gravatarUrlForEmail } from './auth.js'
import type { PoolClient } from 'pg'

export const LEARNING_PRESET_VERSION = 1

export type LearningPersonaKey = 'nova' | 'sage' | 'milo' | 'trace' | 'scout' | 'forge'

export interface StarterAgent {
  /** Preferred id; we'll suffix on collision. */
  id: string
  presetKey: LearningPersonaKey
  name: string
  role: string
  initial: string
  avatarBg: string
  bio: string
  systemPrompt: string
  tools?: string[]
}

const LEARNING_COLLABORATION_RULES = `Match the student's language. In group conversations, do not repeat another agent's answer: speak when directly asked, when the question clearly belongs to your role, or when a correction is necessary. Keep agent-to-agent coordination brief. End substantive guidance with one concrete next step the student can take.`

export const STARTER_TEAM: StarterAgent[] = [
  {
    id: 'nova',
    presetKey: 'nova',
    name: 'Nova',
    role: '学习教练 · Study Coach',
    initial: 'N',
    avatarBg: '#D99A27',
    bio: '把目标拆成今天能完成的一步，并持续照看计划、进度与复习。',
    systemPrompt: `You are Nova, the student's Study Coach. Turn vague goals into realistic plans, clarify deadlines and current level, track progress, schedule review, and coordinate the other learning roles. You own spaced review and consolidation. Do not replace Sage's deep concept teaching, Milo's step-by-step practice, Trace's error diagnosis, Scout's research, or Forge's implementation work; bring them in when their expertise is the next useful move. ${LEARNING_COLLABORATION_RULES}`,
    tools: ['bash'],
  },
  {
    id: 'sage',
    presetKey: 'sage',
    name: 'Sage',
    role: '概念导师 · Concept Tutor',
    initial: 'S',
    avatarBg: '#E4802B',
    bio: '从直觉、类比到正式定义，把“听懂了”变成真正会解释。',
    systemPrompt: `You are Sage, the student's Concept Tutor. Explain ideas from intuition to formal definition, use precise analogies and counterexamples, ask short Socratic questions, and check understanding before moving on. Correct misconceptions without shaming the student. Do not take over exercise drilling or implementation when Milo or Forge is better suited. ${LEARNING_COLLABORATION_RULES}`,
    tools: ['bash'],
  },
  {
    id: 'milo',
    presetKey: 'milo',
    name: 'Milo',
    role: '解题陪练 · Problem Coach',
    initial: 'M',
    avatarBg: '#27AFA8',
    bio: '用分层提示陪你推到答案，再用变式练习确认方法真的掌握。',
    systemPrompt: `You are Milo, the student's Problem Coach. Ask the student to attempt the problem, provide the smallest useful hint, reveal derivations step by step, and generate targeted practice and variations. Prefer coaching over immediately giving a final answer, while still giving a complete worked solution when the student asks or is truly stuck. Leave root-cause diagnosis of repeated errors to Trace. ${LEARNING_COLLABORATION_RULES}`,
    tools: ['bash'],
  },
  {
    id: 'trace',
    presetKey: 'trace',
    name: 'Trace',
    role: '错因诊断 · Learning Diagnostician',
    initial: 'T',
    avatarBg: '#D94D4D',
    bio: '从错题里定位知识漏洞、误区和反复出现的错误模式。',
    systemPrompt: `You are Trace, the student's Learning Diagnostician. Inspect the student's work rather than guessing, separate conceptual gaps from procedural mistakes and slips, identify recurring error patterns, and prescribe a small verification or remediation exercise. Be factual and non-judgmental. Do not reteach an entire topic when a focused diagnosis and handoff to Sage or Milo is enough. ${LEARNING_COLLABORATION_RULES}`,
    tools: ['bash'],
  },
  {
    id: 'scout',
    presetKey: 'scout',
    name: 'Scout',
    role: '阅读研究 · Research Guide',
    initial: 'S',
    avatarBg: '#377FD1',
    bio: '带你读教材、PDF 与论文，检索可靠资料并整理成可用的笔记。',
    systemPrompt: `You are Scout, the student's Research Guide. Help read textbooks, PDFs, and papers; search for reliable sources; distinguish evidence from inference; synthesize notes; and support clear academic writing without fabricating citations. Preserve the student's voice and make source provenance explicit. Hand implementation and experiment execution to Forge. ${LEARNING_COLLABORATION_RULES}`,
    tools: ['bash'],
  },
  {
    id: 'forge',
    presetKey: 'forge',
    name: 'Forge',
    role: '实践导师 · Practice Mentor',
    initial: 'F',
    avatarBg: '#38A06B',
    bio: '把原理落到实验、代码和项目里，用可复现的步骤一起做出来。',
    systemPrompt: `You are Forge, the student's Practice Mentor. Guide experiments, programming, debugging, project implementation, data analysis, and reproducible engineering work. Start from the actual environment and observed output, make assumptions explicit, verify each important step, and explain safety constraints when relevant. Ask Scout for source work and Sage for conceptual clarification instead of duplicating them. ${LEARNING_COLLABORATION_RULES}`,
    tools: ['bash'],
  },
]

export interface StarterRoom {
  presetKey: 'study-room' | 'lab'
  title: string
  agentKeys: LearningPersonaKey[]
  welcomeAuthorKey: LearningPersonaKey
  welcome: string
}

export const STARTER_ROOMS: StarterRoom[] = [
  {
    presetKey: 'study-room',
    title: 'Study Room｜学习室',
    agentKeys: ['nova', 'sage', 'milo', 'trace'],
    welcomeAuthorKey: 'nova',
    welcome: '欢迎来到 Study Room｜学习室。告诉我你正在学什么、截止时间和当前卡点：我会帮你拆目标和安排复习，Sage 讲清概念，Milo 陪你练题，Trace 帮你找到错因。你可以从“帮我制定本周高数复习计划”或“我卡在拉格朗日乘数法”开始。',
  },
  {
    presetKey: 'lab',
    title: 'Lab｜实践工坊',
    agentKeys: ['forge', 'scout', 'sage'],
    welcomeAuthorKey: 'forge',
    welcome: '欢迎来到 Lab｜实践工坊。把实验、代码、论文复现或项目目标，以及现有材料和报错贴上来：我负责推进实践，Scout 查资料和读论文，Sage 补足原理。你可以从“帮我复现这篇论文”“这段代码为什么跑不通”或“帮我设计这个实验”开始。',
  },
]

type QueryClient = Pick<PoolClient, 'query'>

async function uniqueId(db: QueryClient, preferredId: string): Promise<string> {
  const { rows } = await db.query(
    `SELECT 1 FROM participants WHERE id = $1 LIMIT 1`,
    [preferredId],
  )
  if (rows.length === 0) return preferredId
  // Suffix with a short random tail. Re-check (super unlikely to collide twice).
  for (let i = 0; i < 5; i++) {
    const candidate = `${preferredId}-${randomUUID().slice(0, 4)}`
    const { rows: r2 } = await db.query(
      `SELECT 1 FROM participants WHERE id = $1 LIMIT 1`,
      [candidate],
    )
    if (r2.length === 0) return candidate
  }
  // Worst case, full uuid suffix.
  return `${preferredId}-${randomUUID().slice(0, 12)}`
}

const LEGACY_PRESET_KEYS = [
  'atlas', 'iris', 'bram', 'nova', 'lumen', 'kael',
  'kiki', 'memo', 'wren', 'sage', 'milo', 'trace', 'scout', 'forge',
] as const

function isLegacyPresetId(id: string): boolean {
  const lower = id.toLowerCase()
  return LEGACY_PRESET_KEYS.some((key) => lower === key || lower.startsWith(`${key}-`))
}

async function purgeLegacyLearningPreset(
  db: QueryClient,
  companyId: string,
  legacyAgentIds: string[],
  allHandsConversationId: string | null,
): Promise<void> {
  const ids = legacyAgentIds

  // Product-owned rooms and legacy default rooms are replaced wholesale.
  await db.query(
    `DELETE FROM conversations
      WHERE company_id = $1
        AND (preset_key IS NOT NULL
          OR id = $2
          OR id LIKE 'allhands-%'
          OR ($1 = 'personal' AND id = 'aurora')
          OR (kind = 'direct' AND members ?| $3::text[]))`,
    [companyId, allHandsConversationId, ids],
  )

  if (ids.length > 0) {
    // Remove every authored trace from surviving shared conversations, then
    // remove the retired agents from the membership arrays without disturbing
    // the remaining member order.
    await db.query(`DELETE FROM messages WHERE company_id = $1 AND author_id = ANY($2::text[])`, [companyId, ids])
    await db.query(
      `UPDATE conversations c
          SET members = COALESCE((
                SELECT jsonb_agg(member.id ORDER BY member.ord)
                  FROM jsonb_array_elements_text(c.members) WITH ORDINALITY AS member(id, ord)
                 WHERE NOT (member.id = ANY($2::text[]))
              ), '[]'::jsonb),
              pulled_by = CASE
                WHEN pulled_by ->> 'agentId' = ANY($2::text[]) THEN NULL
                ELSE pulled_by
              END,
              updated_at = NOW()
        WHERE c.company_id = $1
          AND (c.members ?| $2::text[] OR c.pulled_by ->> 'agentId' = ANY($2::text[]))`,
      [companyId, ids],
    )
    await db.query(
      `DELETE FROM conversations WHERE company_id = $1 AND jsonb_array_length(members) < 2`,
      [companyId],
    )

    // Shared objects authored by a retired preset are removed. Assignments on
    // somebody else's object are cleared instead of deleting that person's work.
    await db.query(
      `DELETE FROM board_card_comments
        WHERE author_id = ANY($1::text[])
          AND card_id IN (SELECT bc.id FROM board_cards bc JOIN boards b ON b.id = bc.board_id WHERE b.company_id = $2)`,
      [ids, companyId],
    )
    await db.query(
      `DELETE FROM board_cards
        WHERE created_by = ANY($1::text[])
          AND board_id IN (SELECT id FROM boards WHERE company_id = $2)`,
      [ids, companyId],
    )
    await db.query(
      `UPDATE board_cards SET assignee_id = NULL, updated_at = NOW()
        WHERE assignee_id = ANY($1::text[])
          AND board_id IN (SELECT id FROM boards WHERE company_id = $2)`,
      [ids, companyId],
    )
    await db.query(
      `DELETE FROM document_updates
        WHERE author_id = ANY($1::text[])
          AND document_id IN (SELECT id FROM documents WHERE company_id = $2)`,
      [ids, companyId],
    )
    await db.query(`DELETE FROM documents WHERE company_id = $1 AND created_by = ANY($2::text[])`, [companyId, ids])
    await db.query(`DELETE FROM boards WHERE company_id = $1 AND created_by = ANY($2::text[])`, [companyId, ids])
    await db.query(`DELETE FROM calendar_events WHERE company_id = $1 AND created_by = ANY($2::text[])`, [companyId, ids])
    await db.query(
      `UPDATE calendar_events SET assignee_id = NULL, updated_at = NOW()
        WHERE company_id = $1 AND assignee_id = ANY($2::text[])`,
      [companyId, ids],
    )
    await db.query(`DELETE FROM poll_votes WHERE company_id = $1 AND voter_participant_id = ANY($2::text[])`, [companyId, ids])
    await db.query(`DELETE FROM convene_sessions WHERE company_id = $1 AND started_by = ANY($2::text[])`, [companyId, ids])
    await db.query(`DELETE FROM convene_transcript WHERE company_id = $1 AND author_id = ANY($2::text[])`, [companyId, ids])
    await db.query(`DELETE FROM convening_info WHERE company_id = $1 AND pulled_by_id = ANY($2::text[])`, [companyId, ids])

    // Shipping artifacts follow the same ownership rule: work created by a
    // retired preset is removed, while a human's work merely loses old-role
    // assignments and approvals.
    await db.query(`DELETE FROM shipping_features WHERE company_id = $1 AND created_by = ANY($2::text[])`, [companyId, ids])
    await db.query(
      `DELETE FROM shipping_invariants
        WHERE created_by = ANY($1::text[])
          AND feature_id IN (SELECT id FROM shipping_features WHERE company_id = $2)`,
      [ids, companyId],
    )
    await db.query(
      `DELETE FROM shipping_verifications
        WHERE created_by = ANY($1::text[])
          AND feature_id IN (SELECT id FROM shipping_features WHERE company_id = $2)`,
      [ids, companyId],
    )
    await db.query(
      `DELETE FROM shipping_regressions
        WHERE created_by = ANY($1::text[])
          AND feature_id IN (SELECT id FROM shipping_features WHERE company_id = $2)`,
      [ids, companyId],
    )
    await db.query(
      `DELETE FROM shipping_releases
        WHERE started_by = ANY($1::text[])
          AND feature_id IN (SELECT id FROM shipping_features WHERE company_id = $2)`,
      [ids, companyId],
    )
    await db.query(`DELETE FROM shipping_friction_reports WHERE company_id = $1 AND reporter_id = ANY($2::text[])`, [companyId, ids])
    await db.query(`DELETE FROM shipping_events WHERE company_id = $1 AND actor_id = ANY($2::text[])`, [companyId, ids])
    await db.query(
      `UPDATE shipping_features
          SET builder_ids = builder_ids - $2::text[],
              updated_by = CASE WHEN updated_by = ANY($2::text[]) THEN created_by ELSE updated_by END,
              updated_at = NOW()
        WHERE company_id = $1
          AND (builder_ids ?| $2::text[] OR updated_by = ANY($2::text[]))`,
      [companyId, ids],
    )
    await db.query(
      `UPDATE shipping_verifications
          SET owner_id = CASE WHEN owner_id = ANY($2::text[]) THEN NULL ELSE owner_id END,
              verified_by_id = CASE WHEN verified_by_id = ANY($2::text[]) THEN NULL ELSE verified_by_id END,
              builder_ids = builder_ids - $2::text[],
              updated_at = NOW()
        WHERE feature_id IN (SELECT id FROM shipping_features WHERE company_id = $1)
          AND (owner_id = ANY($2::text[])
            OR verified_by_id = ANY($2::text[])
            OR builder_ids ?| $2::text[])`,
      [companyId, ids],
    )
    await db.query(
      `UPDATE shipping_releases
          SET approved_by = NULL, updated_at = NOW()
        WHERE approved_by = ANY($1::text[])
          AND feature_id IN (SELECT id FROM shipping_features WHERE company_id = $2)`,
      [ids, companyId],
    )

    for (const table of ['agent_workspace', 'agent_memory', 'agent_log', 'agent_tasks', 'agent_autonomy', 'agent_climate', 'tool_calls', 'agent_events', 'agent_runs', 'agent_triages', 'llm_calls', 'llm_calls_rollup'] as const) {
      await db.query(`DELETE FROM ${table} WHERE company_id = $1 AND agent_id = ANY($2::text[])`, [companyId, ids])
    }
    // This ledger predates tenant columns, but agent ids are globally unique.
    await db.query(`DELETE FROM agent_action_executions WHERE agent_id = ANY($1::text[])`, [ids])
    await db.query(`DELETE FROM participants WHERE company_id = $1 AND id = ANY($2::text[])`, [companyId, ids])
  }

  // The original personal development seed owned this project but had no
  // creator column with which to identify it.
  if (companyId === 'personal') {
    await db.query(`DELETE FROM projects WHERE company_id = $1 AND id = 'p-aurora'`, [companyId])
  }
}

async function seedLearningPreset(
  db: QueryClient,
  companyId: string,
  ownerId: string,
  opts?: { computerId?: string | null; engine?: string | null },
): Promise<void> {
  const agentIds = new Map<LearningPersonaKey, string>()
  for (const agent of STARTER_TEAM) {
    const id = await uniqueId(db, agent.id)
    agentIds.set(agent.presetKey, id)
    await db.query(
      `INSERT INTO participants (
         id, preset_key, kind, name, role, initial, avatar_bg, avatar_url, status,
         bio, tools, system_prompt, company_id, computer_id, engine
       ) VALUES ($1, $2, 'agent', $3, $4, $5, $6, NULL, 'avail', $7, $8::jsonb, $9, $10, $11, $12)`,
      [
        id, agent.presetKey, agent.name, agent.role, agent.initial, agent.avatarBg,
        agent.bio, JSON.stringify(agent.tools ?? ['bash']), agent.systemPrompt, companyId,
        opts?.computerId ?? null, opts?.engine ?? null,
      ],
    )

    const dmId = `direct-${id}-${randomUUID().slice(0, 6)}`
    await db.query(
      `INSERT INTO conversations (id, preset_key, kind, title, subtitle, members, pinned, tag, company_id)
       VALUES ($1, $2, 'direct', $3, NULL, $4::jsonb, FALSE, NULL, $5)`,
      [dmId, `dm:${agent.presetKey}`, agent.name, JSON.stringify([ownerId, id]), companyId],
    )
    await db.query(
      `INSERT INTO conversation_counters (conversation_id, next_sequence) VALUES ($1, 1)`,
      [dmId],
    )
  }

  for (const room of STARTER_ROOMS) {
    const memberIds = room.agentKeys.map((key) => agentIds.get(key)!)
    const authorId = agentIds.get(room.welcomeAuthorKey)!
    const roomId = `preset-${room.presetKey}-${randomUUID().slice(0, 8)}`
    const members = [ownerId, ...memberIds]
    await db.query(
      `INSERT INTO conversations (id, preset_key, kind, title, subtitle, topic, members, leader_id, pinned, tag, company_id)
       VALUES ($1, $2, 'group', $3, $4, $5, $6::jsonb, $7, TRUE, 'team', $8)`,
      [
        roomId, `room:${room.presetKey}`, room.title, `team · ${members.length}`,
        room.presetKey === 'study-room'
          ? '日常学习、概念理解、解题练习与错因诊断'
          : '实验、编程、科研、数据分析、论文复现与项目实践',
        JSON.stringify(members), authorId, companyId,
      ],
    )
    await db.query(
      `INSERT INTO messages (id, conversation_id, author_id, kind, body, sequence, company_id)
       VALUES ($1, $2, $3, 'text', $4, 1, $5)`,
      [`m-${randomUUID()}`, roomId, authorId, room.welcome, companyId],
    )
    await db.query(
      `INSERT INTO conversation_counters (conversation_id, next_sequence) VALUES ($1, 2)`,
      [roomId],
    )
  }
}

/** Install or force-upgrade one workspace to the current learning preset. */
export async function onboardStarterAgents(
  companyId: string,
  opts?: { computerId?: string | null; engine?: string | null },
): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<{
      owner_user_id: string | null
      all_hands_conversation_id: string | null
      starter_preset_version: number
    }>(
      `SELECT owner_user_id, all_hands_conversation_id, starter_preset_version
         FROM companies WHERE id = $1 FOR UPDATE`,
      [companyId],
    )
    const company = rows[0]
    if (!company || company.starter_preset_version >= LEARNING_PRESET_VERSION) {
      await client.query('COMMIT')
      return
    }

    let ownerId = company.owner_user_id
    if (!ownerId) {
      const owner = await client.query<{ user_id: string }>(
        `SELECT user_id FROM company_members
          WHERE company_id = $1 AND role = 'owner'
          ORDER BY joined_at ASC LIMIT 1`,
        [companyId],
      )
      ownerId = owner.rows[0]?.user_id ?? null
    }
    if (!ownerId) {
      await client.query('ROLLBACK')
      return
    }

    const existing = await client.query<{ id: string; preset_key: string | null; computer_id: string | null; engine: string | null }>(
      `SELECT id, preset_key, computer_id, engine FROM participants
        WHERE company_id = $1 AND kind = 'agent'`,
      [companyId],
    )
    const legacy = existing.rows.filter((agent) => agent.preset_key !== null || isLegacyPresetId(agent.id))
    const inheritedHost = legacy.find((agent) => agent.computer_id || agent.engine)
    await purgeLegacyLearningPreset(
      client,
      companyId,
      legacy.map((agent) => agent.id),
      company.all_hands_conversation_id,
    )
    await seedLearningPreset(client, companyId, ownerId, {
      computerId: opts?.computerId ?? inheritedHost?.computer_id ?? null,
      engine: opts?.engine ?? inheritedHost?.engine ?? null,
    })
    await client.query(
      `UPDATE companies
          SET starter_preset_version = $2,
              starter_seeded_at = COALESCE(starter_seeded_at, NOW()),
              starter_dms_seeded_at = COALESCE(starter_dms_seeded_at, NOW()),
              all_hands_conversation_id = NULL,
              all_hands_seeded_at = COALESCE(all_hands_seeded_at, NOW())
        WHERE id = $1`,
      [companyId, LEARNING_PRESET_VERSION],
    )
    await client.query('COMMIT')
    invalidatePersonaCache()
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

/**
 * Compatibility no-op for callers that predate the learning-room preset.
 * Study Room and Lab intentionally keep fixed membership; new humans and
 * custom agents are invited explicitly instead of joining a hidden all-hands.
 */
export async function joinAllHands(_args: {
  companyId: string
  participantId: string
}): Promise<void> {
  return
}

/**
 * Open a 1:1 direct conversation between `memberId` and every other current
 * member of the company (agents + humans, excluding departed). Idempotent
 * per pair: if a direct convo with exactly those two members already exists,
 * we skip it.
 *
 * Why: Study Room and Lab intentionally keep fixed membership. Direct chats
 * remain the discovery path for newly invited people, so every teammate is
 * still reachable without silently changing either built-in room.
 *
 * Pair coverage spans humans too (not just agents): a new joiner should be
 * able to click any of their colleagues by name, same as the owner can.
 * Yes, this is O(N) inserts per join, and an N-person workspace ends up
 * with O(N²) DM rows once everyone's joined — accepted as the cost of
 * a discoverable sidebar.
 */
export async function seedMemberDms(args: {
  companyId: string
  memberId: string
}): Promise<void> {
  const { companyId, memberId } = args
  const { rows: others } = await pool.query<{ id: string; name: string; kind: 'agent' | 'human' }>(
    `SELECT id, name, kind FROM participants
      WHERE company_id = $1
        AND id <> $2
        AND departed_at IS NULL`,
    [companyId, memberId],
  )
  for (const other of others) {
    // Skip if a direct chat between this pair already exists in this
    // company — saves redundant rows on partial reruns or when the same
    // member is somehow re-onboarded.
    const { rows: ex } = await pool.query(
      `SELECT 1 FROM conversations
        WHERE company_id = $1 AND kind = 'direct'
          AND members @> to_jsonb(ARRAY[$2::text, $3::text])
          AND jsonb_array_length(members) = 2 LIMIT 1`,
      [companyId, memberId, other.id],
    )
    if (ex[0]) continue
    const dmId = `direct-${other.id}-${randomUUID().slice(0, 6)}`
    await pool.query(
      `INSERT INTO conversations (id, kind, title, subtitle, members, pinned, tag, company_id)
       VALUES ($1, 'direct', $2, NULL, $3::jsonb, FALSE, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [dmId, other.name, JSON.stringify([memberId, other.id]),
       other.kind === 'human' ? 'human' : null, companyId],
    )
    await pool.query(
      `INSERT INTO conversation_counters (conversation_id, next_sequence) VALUES ($1, 1)
       ON CONFLICT (conversation_id) DO NOTHING`,
      [dmId],
    )
  }
}

/**
 * Boot-time backfill: assign Gravatar URLs to any human participant who
 * doesn't have an avatar_url yet. Joins on users.email so people who were
 * created before the Gravatar wiring get a portrait without manual fix-up.
 * Idempotent — only touches rows where avatar_url IS NULL.
 */
export async function backfillHumanGravatars(): Promise<void> {
  const { rows } = await pool.query<{ id: string; company_id: string; email: string | null }>(
    `SELECT p.id, p.company_id, u.email
       FROM participants p
       JOIN users u ON u.id = p.id
      WHERE p.kind = 'human' AND p.avatar_url IS NULL AND u.email IS NOT NULL`,
  )
  if (rows.length === 0) return
  for (const r of rows) {
    if (!r.email) continue
    await pool.query(
      `UPDATE participants SET avatar_url = $1 WHERE id = $2 AND company_id = $3`,
      [gravatarUrlForEmail(r.email), r.id, r.company_id],
    )
  }
  console.log(`[onboard] backfilled gravatars for ${rows.length} human participant(s)`)
}

/** Force-upgrade every owned workspace that has not reached this preset version. */
export async function backfillStarterAgents(): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT c.id FROM companies c
      WHERE c.starter_preset_version < $1
        AND (c.owner_user_id IS NOT NULL OR EXISTS (
          SELECT 1 FROM company_members cm
           WHERE cm.company_id = c.id AND cm.role = 'owner'
        ))`,
    [LEARNING_PRESET_VERSION],
  )
  if (rows.length === 0) return
  console.log(`[onboard] upgrading ${rows.length} compan${rows.length === 1 ? 'y' : 'ies'} to learning preset v${LEARNING_PRESET_VERSION}`)
  for (const { id } of rows) {
    try { await onboardStarterAgents(id) }
    catch (e) { console.warn(`[onboard] learning preset upgrade failed for ${id}`, e) }
  }
}
