/**
 * Native memory embeddings through the configured OpenAI API.
 *
 * Used by:
 *   - `lingxiloop memory note` — embeds the body at write time and stores
 *     the vector in `agent_workspace.embedding`.
 *   - `loadMemory(agentId, queryText)` — embeds the recent inbox
 *     context at wake time so the retriever can pull semantically
 *     relevant memories alongside pinned + most-recent.
 *
 * Provider and vector-shape failures propagate; semantic memory never
 * silently changes to recency-only behavior.
 */
import { env } from '../env.js'
import { pool } from '../db/pool.js'
import { createEmbedding } from '../llm.js'

const EMBED_DIM = 1536
/** We cap at 8K characters
 *  (~2K tokens) which is plenty for a single memory entry or a few
 *  recent inbox messages. */
const MAX_INPUT_CHARS = 8000

/** Test-only override. When set, every {@link embedText} call returns
 *  whatever this function produces — bypassing the configured gateway's
 *  embeddings API. Production code never sets this; integration tests
 *  use it to make memory writes deterministic without spending
 *  provider request. */
let testEmbedOverride: ((text: string) => string | Promise<string>) | null = null
export function __setEmbedTextOverrideForTesting(fn: typeof testEmbedOverride): void {
  testEmbedOverride = fn
}

/** Embed a string as a Postgres-pgvector literal. */
export async function embedText(text: string, context: { companyId: string; agentId?: string | null }): Promise<string> {
  const trimmed = (text ?? '').trim()
  if (!trimmed) throw new Error('embedding input is required')
  if (testEmbedOverride) return testEmbedOverride(trimmed)
  const resp = await createEmbedding({ purpose: 'memory-embedding', ...context }, {
    model: env.OPENAI_EMBEDDING_MODEL,
    input: trimmed.length > MAX_INPUT_CHARS ? trimmed.slice(0, MAX_INPUT_CHARS) : trimmed,
  })
  const vec = resp.data[0]?.embedding
  if (!Array.isArray(vec) || vec.length !== EMBED_DIM) throw new Error(`embedding dimension must be ${EMBED_DIM}`)
  return `[${vec.join(',')}]`
}

/** Batch variant used by knowledge-source indexing. The provider sees at
 * most 50 inputs per request; callers still get one nullable vector per
 * input so keyword-only indexing remains usable on partial failures. */
export async function embedTexts(texts: string[], context: { companyId: string; agentId?: string | null }): Promise<string[]> {
  if (texts.length === 0) return []
  if (testEmbedOverride) return Promise.all(texts.map((value) => embedText(value, context)))
  const output: string[] = []
  for (let offset = 0; offset < texts.length; offset += 50) {
    const batch = texts.slice(offset, offset + 50).map((text) => text.trim().slice(0, MAX_INPUT_CHARS))
    const response = await createEmbedding({ purpose: 'knowledge-embedding', ...context }, {
      model: env.OPENAI_EMBEDDING_MODEL,
      input: batch,
    })
    output.push(...batch.map((_text, index) => {
      const vector = response.data[index]?.embedding
      if (!Array.isArray(vector) || vector.length !== EMBED_DIM) throw new Error(`embedding dimension must be ${EMBED_DIM}`)
      return `[${vector.join(',')}]`
    }))
  }
  return output
}

/** Whether pgvector is actually installed in this database. Cached so
 *  loadMemory doesn't probe on every wake. `null` = not yet probed. */
let pgvectorAvailable: boolean | null = null
export async function hasPgVector(): Promise<boolean> {
  if (pgvectorAvailable !== null) return pgvectorAvailable
  try {
    const { rows } = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS exists`,
    )
    pgvectorAvailable = !!rows[0]?.exists
  } catch (error) {
    throw new Error('pgvector extension check failed', { cause: error })
  }
  return pgvectorAvailable
}
