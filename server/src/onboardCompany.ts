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

import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { invalidatePersonaCache } from './agents/personas.js'
import { pool } from './db/pool.js'
import { reconcileLearningChannels } from './im/reconcile.js'
import {
  LEARNING_PRESET_VERSION as CANONICAL_LEARNING_PRESET_VERSION,
  STARTER_ROOMS as CANONICAL_STARTER_ROOMS,
  STARTER_TEAM as CANONICAL_STARTER_TEAM,
} from './learning/preset.js'

export const LEARNING_PRESET_VERSION = CANONICAL_LEARNING_PRESET_VERSION

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

const LEARNING_COLLABORATION_RULES = `Match the student's language. In group conversations, do not repeat another agent's answer: speak when directly asked, when the question clearly belongs to your role, or when a correction is necessary. Keep agent-to-agent coordination brief. End substantive guidance with one concrete next step the student can take.

Canvas autonomy: IPython is your only model-visible tool, and loop.canvas is preloaded inside it. Proactively use loop.canvas.available_agents() and loop.canvas.start_workspace(...) when the request benefits from two or more learning specialties, parallel investigation, a staged dependency, or a shared visual result that the student should watch evolve. Do not ask the student to open Canvas, choose agents, or assign work. Select only the useful capable agents yourself, give each a concrete deliverable, and declare dependsOnAgentIds when order matters. For a quick single-agent answer, reply normally instead of creating ceremony. If you are a Canvas worker, read the workspace with loop.canvas.get(canvasId=...), publish progress with loop.canvas.set_status(canvasId=..., status=..., frameId=...), and create or update usable html, markdown, document, image, or artifact frames. A student's right-click @ assignment or card feedback is actionable steering for this same workspace: apply it to the relevant frame and continue visibly in Canvas rather than replying to the source conversation. Before replacing content, read the latest frame and pass baseRevision to loop.canvas.update_frame(...); use loop.canvas.append_content(...) for atomic additions. When another specialist should own the next step, call loop.canvas.handoff(canvasId=..., toAgentId=..., task=..., context=..., frameIds=[...]) so the task, relevant frame references, and visible activity stay in the same durable workspace. You may recruit another capable learning agent with loop.canvas.add_agents(...) only when a real missing specialty emerges.`

export const LEGACY_STARTER_TEAM: StarterAgent[] = [
  {
    id: 'nova',
    presetKey: 'nova',
    name: 'Nova',
    role: '团队负责人 · Chief of Staff',
    initial: 'N',
    avatarBg: '#D99A27',
    bio: '接住你的目标，明确拆分与负责人，协调团队并给出一个最终汇总。',
    systemPrompt: `You are Nova, the team's Chief of Staff and Study Coach. Turn vague goals into realistic plans, inspect the current roster and availability, and delegate clearly owned specialist work with visible progress. Prefer an autonomous Canvas workspace over chat handoffs whenever several specialists or a shared evolving result will materially help. You may start parallel and dependent assignments, wait for their Canvas results, and synthesize the single final answer for the human. Never claim a teammate completed work before the workspace shows it. You also own progress planning, spaced review, and consolidation. Do not replace Sage's deep concept teaching, Milo's step-by-step practice, Trace's error diagnosis, Scout's research, or Forge's implementation work; bring them in when their expertise is the next useful move. ${LEARNING_COLLABORATION_RULES}`,
    tools: ['ipython'],
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
    tools: ['ipython'],
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
    tools: ['ipython'],
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
    tools: ['ipython'],
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
    tools: ['ipython'],
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
    tools: ['ipython'],
  },
]

export interface StarterRoom {
  presetKey: 'study-room' | 'lab'
  title: string
  agentKeys: LearningPersonaKey[]
  welcomeAuthorKey: LearningPersonaKey
  welcome: string
}

export const LEGACY_STARTER_ROOMS: StarterRoom[] = [
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

export const STARTER_TEAM = CANONICAL_STARTER_TEAM
export const STARTER_ROOMS = CANONICAL_STARTER_ROOMS

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

const RETIRED_BUILTIN_KEYS = [
  'atlas', 'iris', 'bram', 'lumen', 'kael', 'kiki', 'memo', 'wren',
] as const

function isRetiredBuiltinId(id: string): boolean {
  const lower = id.toLowerCase()
  return RETIRED_BUILTIN_KEYS.some((key) => lower === key || lower.startsWith(`${key}-`))
}

async function purgeLegacyLearningPreset(
  db: QueryClient,
  companyId: string,
  legacyAgentIds: string[],
  allHandsConversationId: string | null,
  replaceProductPreset = true,
): Promise<void> {
  const ids = legacyAgentIds

  if (replaceProductPreset) {
    // Legacy workspaces replace all product-owned rooms wholesale.
    await db.query(
      `DELETE FROM im_channel_bindings
        WHERE company_id=$1 AND (preset_key IS NOT NULL OR leader_agent_id=ANY($2::text[]))`,
      [companyId, ids],
    )
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
  } else {
    // v3 already has the six learning agents. Preserve their identities,
    // conversations, memory and Canvas history; remove only retired built-ins.
    await db.query(
      `DELETE FROM im_channel_bindings
        WHERE company_id=$1 AND leader_agent_id=ANY($2::text[])`,
      [companyId, ids],
    )
    await db.query(
      `DELETE FROM conversations
        WHERE company_id = $1
          AND (id = $2
            OR id LIKE 'allhands-%'
            OR ($1 = 'personal' AND id = 'aurora')
            OR (kind = 'direct' AND members ?| $3::text[]))`,
      [companyId, allHandsConversationId, ids],
    )
  }

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
    await db.query(
      `UPDATE im_channel_bindings binding
          SET profile = jsonb_set(binding.profile, '{members}', conversation.members, true)
         FROM conversations conversation
        WHERE binding.company_id = $1
          AND binding.channel_id = conversation.id
          AND conversation.company_id = $1
          AND binding.profile -> 'members' IS DISTINCT FROM conversation.members`,
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

    for (const table of ['agent_workspace', 'agent_log', 'agent_tasks', 'agent_autonomy', 'agent_climate', 'tool_calls', 'agent_events', 'agent_runs', 'agent_triages', 'llm_calls', 'llm_calls_rollup'] as const) {
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
): Promise<void> {
  const { rows: workspaces } = await db.query<{ id: string }>(
    `SELECT id FROM projects WHERE company_id=$1 AND is_general=TRUE LIMIT 1`,
    [companyId],
  )
  const projectId = workspaces[0]?.id
  if (!projectId) throw new Error('general workspace must exist before starter onboarding')
  const agentIds = new Map<LearningPersonaKey, string>()
  for (const agent of STARTER_TEAM) {
    const id = await uniqueId(db, agent.id)
    agentIds.set(agent.presetKey, id)
    await db.query(
      `INSERT INTO participants (
         id, preset_key, kind, name, role, initial, avatar_bg, avatar_url, status,
         bio, tools, capabilities, system_prompt, company_id
       ) VALUES ($1, $2, 'agent', $3, $4, $5, $6, NULL, 'avail', $7, $8::jsonb, $9::jsonb, $10, $11)`,
      [
        id, agent.presetKey, agent.name, agent.role, agent.initial, agent.avatarBg,
        agent.bio, JSON.stringify(agent.tools), JSON.stringify(agent.capabilities), agent.systemPrompt, companyId,
      ],
    )

    const dmId = `direct-${id}-${randomUUID().slice(0, 6)}`
    await db.query(
      `INSERT INTO conversations (id, preset_key, kind, title, subtitle, members, pinned, tag, company_id, project_id)
       VALUES ($1, $2, 'direct', $3, NULL, $4::jsonb, FALSE, NULL, $5, $6)`,
      [dmId, `dm:${agent.presetKey}`, agent.name, JSON.stringify([ownerId, id]), companyId, projectId],
    )
    await db.query(
      `INSERT INTO im_channel_bindings (channel_id, company_id, profile, leader_agent_id, preset_key)
       VALUES ($1,$2,$3::jsonb,$4,$5)`,
      [dmId, companyId, JSON.stringify({
        channelId: dmId, channelType: 2, kind: 'direct', title: agent.name, members: [ownerId, id], createdAt: new Date().toISOString(),
      }), id, `dm:${agent.presetKey}`],
    )
  }

  for (const room of STARTER_ROOMS) {
    const memberIds = room.agentKeys.map((key) => agentIds.get(key)!)
    const authorId = agentIds.get(room.welcomeAuthorKey)!
    const roomId = `preset-${room.presetKey}-${randomUUID().slice(0, 8)}`
    const members = [ownerId, ...memberIds]
    await db.query(
      `INSERT INTO conversations (id, preset_key, kind, title, subtitle, topic, members, leader_id, pinned, tag, company_id, project_id)
       VALUES ($1, $2, 'group', $3, $4, $5, $6::jsonb, $7, TRUE, 'team', $8, $9)`,
      [
        roomId, `room:${room.presetKey}`, room.title, `team · ${members.length}`,
        room.presetKey === 'study-room'
          ? '日常学习、概念理解、解题练习与错因诊断'
          : '实验、编程、科研、数据分析、论文复现与项目实践',
        JSON.stringify(members), authorId, companyId, projectId,
      ],
    )
    await db.query(
      `INSERT INTO im_channel_bindings (channel_id, company_id, profile, leader_agent_id, preset_key)
       VALUES ($1,$2,$3::jsonb,$4,$5)`,
      [roomId, companyId, JSON.stringify({
        channelId: roomId, channelType: 2, title: room.title, members,
        topic: room.presetKey === 'study-room'
          ? '日常学习、概念理解、解题练习与错因诊断'
          : '实验、编程、科研、数据分析、论文复现与项目实践',
        welcome: room.welcome, welcomeAuthorId: authorId, pinned: true, createdAt: new Date().toISOString(),
      }), authorId, `room:${room.presetKey}`],
    )
  }
}
async function refreshLearningPreset(db: QueryClient, companyId: string): Promise<void> {
  for (const agent of STARTER_TEAM) {
    await db.query(
      `UPDATE participants
          SET name=$3, role=$4, initial=$5, avatar_bg=$6, avatar_url=NULL,
              status=CASE WHEN status='offboarded' THEN status ELSE 'avail' END,
              bio=$7, tools=$8::jsonb, capabilities=$9::jsonb, system_prompt=$10
        WHERE company_id=$1 AND kind='agent' AND preset_key=$2`,
      [
        companyId, agent.presetKey, agent.name, agent.role, agent.initial,
        agent.avatarBg, agent.bio, JSON.stringify(agent.tools), JSON.stringify(agent.capabilities), agent.systemPrompt,
      ],
    )
  }
}

/** Install or force-upgrade one workspace to the current learning preset. */
export async function onboardStarterAgents(
  companyId: string,
): Promise<void> {
  let seeded = false
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

    // New companies created after the schema migration do not pass through
    // the historical backfill. Establish their immutable landing workspace
    // before starter conversations are inserted.
    await client.query(
      `INSERT INTO projects (id, company_id, name, description, color, created_by, is_general)
       SELECT $2, $1, '通用工作区', '未指定工作区的会话与资料', '#667085', $3, TRUE
        WHERE NOT EXISTS (SELECT 1 FROM projects WHERE company_id=$1 AND is_general=TRUE)`,
      [companyId, `general-${randomUUID().slice(0, 18)}`, ownerId],
    )

    const existing = await client.query<{ id: string; preset_key: string | null }>(
      `SELECT id, preset_key FROM participants
        WHERE company_id = $1 AND kind = 'agent'`,
      [companyId],
    )
    if (company.starter_preset_version >= 3) {
      const currentKeys = new Set<string>(STARTER_TEAM.map((agent) => agent.presetKey))
      const retired = existing.rows.filter((agent) =>
        (agent.preset_key !== null && !currentKeys.has(agent.preset_key))
        || (agent.preset_key === null && isRetiredBuiltinId(agent.id)),
      )
      await purgeLegacyLearningPreset(
        client,
        companyId,
        retired.map((agent) => agent.id),
        company.all_hands_conversation_id,
        false,
      )
      await refreshLearningPreset(client, companyId)
    } else {
      const legacy = existing.rows.filter((agent) => agent.preset_key !== null || isRetiredBuiltinId(agent.id))
      await purgeLegacyLearningPreset(
        client,
        companyId,
        legacy.map((agent) => agent.id),
        company.all_hands_conversation_id,
      )
      await seedLearningPreset(client, companyId, ownerId)
    }
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
    seeded = true
    invalidatePersonaCache()
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  if (seeded) {
    await reconcileLearningChannels().catch((error) => {
      console.warn('[onboard] WuKongIM reconciliation deferred:', error instanceof Error ? error.message : String(error))
    })
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
  const { rows: workspaces } = await pool.query<{ id: string }>(
    `SELECT id FROM projects WHERE company_id=$1 AND is_general=TRUE LIMIT 1`,
    [companyId],
  )
  const projectId = workspaces[0]?.id
  if (!projectId) throw new Error('general workspace must exist before member onboarding')
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
        WHERE company_id = $1 AND project_id = $4 AND kind = 'direct'
          AND members @> to_jsonb(ARRAY[$2::text, $3::text])
          AND jsonb_array_length(members) = 2 LIMIT 1`,
      [companyId, memberId, other.id, projectId],
    )
    if (ex[0]) continue
    const dmId = `direct-${other.id}-${randomUUID().slice(0, 6)}`
    await pool.query(
      `INSERT INTO conversations (id, kind, title, subtitle, members, pinned, tag, company_id, project_id)
       VALUES ($1, 'direct', $2, NULL, $3::jsonb, FALSE, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [dmId, other.name, JSON.stringify([memberId, other.id]),
       other.kind === 'human' ? 'human' : null, companyId, projectId],
    )
    await pool.query(
      `INSERT INTO conversation_counters (conversation_id, next_sequence) VALUES ($1, 1)
       ON CONFLICT (conversation_id) DO NOTHING`,
      [dmId],
    )
  }
}
