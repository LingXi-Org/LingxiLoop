import { timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import { pool } from '../../db/pool.js'
import { env } from '../../env.js'
import { safe } from '../../http/async-handler.js'
import { createEmbedding } from '../../llm.js'

export const openNotebookEmbeddingRouter = Router()

function authorized(header: string | undefined): boolean {
  const expected = process.env.OPEN_NOTEBOOK_PASSWORD ?? ''
  const actual = header?.replace(/^Bearer\s+/i, '') ?? ''
  const left = Buffer.from(expected)
  const right = Buffer.from(actual)
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right)
}

const proModel = 'Pro/BAAI/bge-m3'
const embeddingHandler = (shadow: boolean) => safe(async (req, res) => {
  if (!authorized(req.headers.authorization)) {
    res.status(401).json({ error: { message: 'unauthorized' } })
    return
  }
  if (shadow && env.OPENAI_EMBEDDING_MODEL !== proModel && process.env.OPEN_NOTEBOOK_SHADOW_EMBEDDING_ENABLED !== 'true') {
    res.status(404).json({ error: { message: 'shadow embeddings unavailable' } })
    return
  }
  const model = shadow ? proModel : env.OPENAI_EMBEDDING_MODEL
  const shadowRequestId = String(req.headers['x-lingxi-shadow-request-id'] ?? '')
  const companyId = String(req.headers['x-lingxi-company-id'] ?? '').trim()
  const input = Array.isArray(req.body?.input) ? req.body.input : [req.body?.input]
  if (!companyId || req.body?.model !== model || (shadow && (shadowRequestId
    ? !/^[a-f0-9]{64}$/.test(shadowRequestId) : env.OPENAI_EMBEDDING_MODEL !== proModel))
    || input.length < 1 || input.length > 50
    || input.some((value: unknown) => typeof value !== 'string' || !value.trim())
    || Buffer.byteLength(JSON.stringify(input)) > 1_000_000) {
    res.status(400).json({ error: { message: 'invalid embedding request' } })
    return
  }
  const company = await pool.query(`SELECT 1 FROM companies WHERE id=$1`, [companyId])
  if (!company.rows[0]) {
    res.status(404).json({ error: { message: 'company not found' } })
    return
  }
  if (shadow && shadowRequestId) res.setHeader('x-lingxi-shadow-request-id', shadowRequestId)
  res.json(await createEmbedding({ purpose: 'knowledge-embedding', companyId,
    ...(shadow && shadowRequestId ? { extras: { shadowRequestId } } : {}),
  }, {
    model,
    input,
  }, shadow ? { maxRetries: 0 } : undefined))
})

openNotebookEmbeddingRouter.post('/v1/embeddings', embeddingHandler(false))
openNotebookEmbeddingRouter.post('/v1/shadow/embeddings', embeddingHandler(true))
