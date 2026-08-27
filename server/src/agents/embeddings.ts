/**
 * Optional memory embeddings exposed by the configured DeepSeek gateway.
 *
 * Used by:
 *   - `lingxiloop memory note` — embeds the body at write time and stores
 *     the vector in `agent_workspace.embedding`.
 *   - `loadMemory(agentId, queryText)` — embeds the recent inbox
 *     context at wake time so the retriever can pull semantically
 *     relevant memories alongside pinned + most-recent.
 *
 * All calls are best-effort: if the API hiccups or the input is
 * empty/oversized, we return `null` and the caller falls back to
 * recency-only retrieval. That way a transient gateway outage doesn't
 * break the entire wake cycle.
 */
import OpenAI from 'openai'
import { env } from '../env.js'
import { pool } from '../db/pool.js'

const EMBED_DIM = 1536
/** We cap at 8K characters
 *  (~2K tokens) which is plenty for a single memory entry or a few
 *  recent inbox messages. */
const MAX_INPUT_CHARS = 8000

const client = new OpenAI({ apiKey: env.DEEPSEEK_API_KEY, baseURL: env.DEEPSEEK_BASE_URL })

/** Test-only override. When set, every {@link embedText} call returns
 *  whatever this function produces — bypassing the configured gateway's
 *  embeddings API. Production code never sets this; integration tests
 *  use it to make memory writes deterministic without spending
 *  embedding credits OR depending on the test runner having a real
 *  DeepSeek credential in env. */
let testEmbedOverride: ((text: string) => string | null | Promise<string | null>) | null = null
export function __setEmbedTextOverrideForTesting(fn: typeof testEmbedOverride): void {
  testEmbedOverride = fn
}

/** Embed a string. Returns a Postgres-pgvector literal string ready
 *  to bind as `$N::vector` in INSERT/UPDATE, or null if it failed. */
export async function embedText(text: string): Promise<string | null> {
  const trimmed = (text ?? '').trim()
  if (!trimmed) return null
  if (testEmbedOverride) return testEmbedOverride(trimmed)
  if (process.env.LINGXILOOP_DISABLE_EMBEDDINGS === '1') return null
  if (!env.DEEPSEEK_EMBEDDING_MODEL) return null
  try {
    const resp = await client.embeddings.create({
      model: env.DEEPSEEK_EMBEDDING_MODEL,
      input: trimmed.length > MAX_INPUT_CHARS ? trimmed.slice(0, MAX_INPUT_CHARS) : trimmed,
    })
    const vec = resp.data[0]?.embedding
    if (!Array.isArray(vec) || vec.length !== EMBED_DIM) return null
    // pgvector accepts the text form `[0.1,0.2,…]` and casts via ::vector.
    return `[${vec.join(',')}]`
  } catch (e) {
    console.warn('[embed] failed', e instanceof Error ? e.message : String(e))
    return null
  }
}

/** Batch variant used by knowledge-source indexing. The provider sees at
 * most 50 inputs per request; callers still get one nullable vector per
 * input so keyword-only indexing remains usable on partial failures. */
export async function embedTexts(texts: string[]): Promise<Array<string | null>> {
  if (texts.length === 0) return []
  if (testEmbedOverride) return Promise.all(texts.map((value) => embedText(value)))
  if (process.env.LINGXILOOP_DISABLE_EMBEDDINGS === '1' || !env.DEEPSEEK_EMBEDDING_MODEL) {
    return texts.map(() => null)
  }
  const output: Array<string | null> = []
  for (let offset = 0; offset < texts.length; offset += 50) {
    const batch = texts.slice(offset, offset + 50).map((text) => text.trim().slice(0, MAX_INPUT_CHARS))
    try {
      const response = await client.embeddings.create({ model: env.DEEPSEEK_EMBEDDING_MODEL, input: batch })
      output.push(...batch.map((_text, index) => {
        const vector = response.data[index]?.embedding
        return Array.isArray(vector) && vector.length === EMBED_DIM ? `[${vector.join(',')}]` : null
      }))
    } catch (error) {
      console.warn('[embed:batch] failed', error instanceof Error ? error.message : String(error))
      output.push(...batch.map(() => null))
    }
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
  } catch {
    pgvectorAvailable = false
  }
  return pgvectorAvailable
}
