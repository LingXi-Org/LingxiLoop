import { getTrackedLlmClient } from './llm-ledger.js'
import type { ResponseInputItem } from 'openai/resources/responses/responses'
import { randomUUID } from 'node:crypto'
import { pool } from '../db/pool.js'
import { env } from '../env.js'
import { enforceModelPolicy, realTaskModel } from './model-policy.js'
import { CH_CONVENE, publish } from '../redis.js'
import { getAllAgentPersonas, getPersona, buildSystemPrompt } from './personas.js'
import { setStatus } from '../status.js'
import { companyIdForConveneSession, companyIdForConversation } from '../tenant.js'

interface SessionRow {
  id: string
  conversation_id: string
  title: string
  flair: string | null
  started_by: string
  started_at: string
  ended_at: string | null
  state: string
}

async function nextTranscriptSequence(sessionId: string): Promise<number> {
  const { rows } = await pool.query<{ c: number }>(
    `SELECT COUNT(*)::int AS c FROM convene_transcript WHERE session_id = $1`,
    [sessionId],
  )
  return (rows[0]?.c ?? 0) + 1
}

async function appendTranscript(args: {
  sessionId: string
  authorId: string
  kind: 'text' | 'thought' | 'tool' | 'decision'
  body: string
  decision?: { headline: string; body: string } | null
}): Promise<{ id: string; sequence: number }> {
  const id = `ct-${randomUUID()}`
  const sequence = await nextTranscriptSequence(args.sessionId)
  await pool.query(
    `INSERT INTO convene_transcript (id, session_id, author_id, kind, body, sequence, decision)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [id, args.sessionId, args.authorId, args.kind, args.body, sequence,
      args.decision ? JSON.stringify(args.decision) : null],
  )
  const companyId = (await companyIdForConveneSession(args.sessionId)) ?? undefined
  await publish(CH_CONVENE, {
    type: 'convene',
    sessionId: args.sessionId,
    conversationId: '',
    companyId,
    kind: 'transcript',
    data: { id, sessionId: args.sessionId, authorId: args.authorId, kind: args.kind, body: args.body, sequence, decision: args.decision ?? null, createdAt: new Date().toISOString() },
  })
  return { id, sequence }
}

export async function getActiveConvene(conversationId: string): Promise<SessionRow | null> {
  const { rows } = await pool.query<SessionRow>(
    `SELECT id, conversation_id, title, flair, started_by, started_at, ended_at, state
       FROM convene_sessions
      WHERE conversation_id = $1 AND state = 'live'
      ORDER BY started_at DESC LIMIT 1`,
    [conversationId],
  )
  return rows[0] ?? null
}

export async function startConvene(args: {
  conversationId: string
  startedBy: string
  topic: string
}): Promise<SessionRow> {
  const id = `cs-${randomUUID()}`
  const { rows: cv } = await pool.query<{ members: string[]; title: string }>(
    `SELECT members, title FROM conversations WHERE id = $1`,
    [args.conversationId],
  )
  const convo = cv[0]
  if (!convo) throw new Error(`conversation ${args.conversationId} not found`)

  const session: SessionRow = {
    id,
    conversation_id: args.conversationId,
    title: `${convo.title} · live`,
    flair: args.topic.slice(0, 80),
    started_by: args.startedBy,
    started_at: new Date().toISOString(),
    ended_at: null,
    state: 'live',
  }

  await pool.query(
    `INSERT INTO convene_sessions (id, conversation_id, title, flair, started_by, started_at, state)
     VALUES ($1,$2,$3,$4,$5,NOW(),'live')`,
    [id, session.conversation_id, session.title, session.flair, session.started_by],
  )

  const companyId = (await companyIdForConversation(args.conversationId)) ?? undefined
  await publish(CH_CONVENE, {
    type: 'convene',
    sessionId: id,
    conversationId: args.conversationId,
    companyId,
    kind: 'started',
    data: session,
  })

  orchestrate({ session, members: convo.members, topic: args.topic }).catch((e) => {
    console.error('[convene] orchestration error', e)
  })

  return session
}

async function orchestrate(args: {
  session: SessionRow
  members: string[]
  topic: string
}): Promise<void> {
  const { session, members, topic } = args
  // Snapshot the agent roster once for this orchestrate run, scoped to the
  // tenant the convene's conversation belongs to.
  const tenant = (await companyIdForConversation(session.conversation_id)) ?? 'personal'
  const allAgents = await getAllAgentPersonas(tenant)
  const nameById = new Map(allAgents.map((p) => [p.id, p.name]))
  const isAgentId = new Set(allAgents.map((p) => p.id))
  const agentMembers = members.filter((m) => isAgentId.has(m))

  const { rows: ctxMsgs } = await pool.query<{ author_id: string; body: string; kind: string }>(
    `SELECT author_id, body, kind FROM messages
      WHERE conversation_id = $1 AND kind IN ('text','thought')
      ORDER BY sequence DESC LIMIT 12`,
    [session.conversation_id],
  )
  const groundingHistory: ResponseInputItem[] = ctxMsgs.reverse().map((m) => ({
    role: 'user',
    content: `[${nameById.get(m.author_id) ?? m.author_id}]: ${m.body}`,
  }))

  for (const agentId of agentMembers) {
    await runAgentTurn({ session, agentId, groundingHistory, topic })
  }

  const summary = await classifyDecision({ sessionId: session.id, topic })
  if (summary) {
    await appendTranscript({
      sessionId: session.id,
      authorId: 'system',
      kind: 'decision',
      body: summary.body,
      decision: { headline: summary.headline, body: summary.body },
    })
  }

  await pool.query(
    `UPDATE convene_sessions SET state = 'ended', ended_at = NOW() WHERE id = $1`,
    [session.id],
  )
  const companyId = (await companyIdForConversation(session.conversation_id)) ?? undefined
  await publish(CH_CONVENE, {
    type: 'convene',
    sessionId: session.id,
    conversationId: session.conversation_id,
    companyId,
    kind: 'ended',
  })
}

async function runAgentTurn(args: {
  session: SessionRow
  agentId: string
  groundingHistory: ResponseInputItem[]
  topic: string
}): Promise<void> {
  const persona = await getPersona(args.agentId)
  if (!persona) return
  await setStatus(args.agentId, 'thinking')

  const { rows: transcript } = await pool.query<{ author_id: string; kind: string; body: string }>(
    `SELECT author_id, kind, body FROM convene_transcript
      WHERE session_id = $1 ORDER BY sequence ASC`,
    [args.session.id],
  )
  // Pre-fetch every distinct author's name in one round-trip.
  const distinctAuthors = [...new Set(transcript.map((t) => t.author_id))]
  const nameByAuthor = new Map<string, string>()
  for (const a of distinctAuthors) {
    const p = await getPersona(a)
    if (p) nameByAuthor.set(a, p.name)
  }
  const transcriptHistory: ResponseInputItem[] = transcript.map((t) => ({
    role: t.author_id === args.agentId ? 'assistant' : 'user',
    content: `[${nameByAuthor.get(t.author_id) ?? t.author_id}]: ${t.body}`,
  }))

  const baseSystem = await buildSystemPrompt(args.agentId)
  const sys = `${baseSystem ?? persona.style}

You're in a LIVE CONVENE — a real-time work session. Other team members will speak too. Be brief (1-3 sentences). Bring your own angle on the topic; don't repeat what's been said.

Topic of this convene: ${args.topic}`

  const tenant = (await companyIdForConversation(args.session.conversation_id)) ?? null
  const client = await getTrackedLlmClient({
    purpose: 'convene-speech',
    companyId: tenant,
    agentId: args.agentId,
    conversationId: args.session.conversation_id,
    extras: { sessionId: args.session.id, topic: args.topic.slice(0, 120) },
  })
  const r = await client.responses.create({
    // A convene speech is the agent's real spoken contribution that humans
    // read — a real task, so the big model is sanctioned here too.
    model: enforceModelPolicy(realTaskModel(persona.model), 'convene-speech'),
    instructions: sys,
    input: [
      ...args.groundingHistory,
      ...transcriptHistory,
      { role: 'user', content: `[Convene moderator]: ${persona.name}, your turn.` },
    ],
    max_output_tokens: 3000,
    reasoning: { effort: 'low' },
  })
  const body = sanitizeToolCallMarkup(r.output_text ?? '').trim()
  if (body) {
    await appendTranscript({ sessionId: args.session.id, authorId: args.agentId, kind: 'text', body })
  }
  await setStatus(args.agentId, 'avail')
}

/** Strip hallucinated tool-call XML when the LLM has no real tools. */
function sanitizeToolCallMarkup(s: string): string {
  return s
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
    .replace(/<function_call>[\s\S]*?<\/function_call>/gi, '')
    .replace(/<\|?tool[_-]?(?:call|name|args)[^>]*\|?>[\s\S]*?<\/\|?tool[_-]?(?:call|name|args)[^>]*\|?>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
}

async function classifyDecision(args: { sessionId: string; topic: string }): Promise<{ headline: string; body: string } | null> {
  const { rows } = await pool.query<{ author_id: string; body: string }>(
    `SELECT author_id, body FROM convene_transcript
      WHERE session_id = $1 AND kind IN ('text','thought')
      ORDER BY sequence ASC`,
    [args.sessionId],
  )
  if (rows.length === 0) return null
  // Pre-fetch names for distinct authors so we don't hammer the cache.
  const distinctAuthors = [...new Set(rows.map((r) => r.author_id))]
  const nameByAuthor = new Map<string, string>()
  for (const a of distinctAuthors) {
    const p = await getPersona(a)
    if (p) nameByAuthor.set(a, p.name)
  }
  const transcript = rows.map((r) => `${nameByAuthor.get(r.author_id) ?? r.author_id}: ${r.body}`).join('\n')

  try {
    const tenant = (await companyIdForConveneSession(args.sessionId)) ?? null
    const client = await getTrackedLlmClient({
      purpose: 'convene-decision',
      companyId: tenant,
      extras: { sessionId: args.sessionId, topic: args.topic.slice(0, 120) },
    })
    const r = await client.responses.create({
      model: env.OPENAI_MODEL_SUPPORT,
      instructions: 'Reply ONLY with strict JSON: {"reached": boolean, "headline": "string", "body": "string"}. headline ≤ 12 words. body ≤ 40 words.',
      input: `Convene topic: ${args.topic}\n\nTranscript:\n${transcript}\n\nDid the team reach a decision? If yes summarize it. Reply as strict JSON.`,
      text: { format: { type: 'json_object' } },
      max_output_tokens: 1200,
      reasoning: { effort: 'low' },
    })
    const parsed = JSON.parse(r.output_text ?? '{}') as { reached?: boolean; headline?: string; body?: string }
    if (parsed.reached && parsed.headline && parsed.body) {
      return { headline: parsed.headline, body: parsed.body }
    }
  } catch (err) {
    console.warn('[convene] decision classifier failed', err)
  }
  return null
}
