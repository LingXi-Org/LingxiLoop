import { timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import { env } from '../../env.js'
import { safe } from '../../http/async-handler.js'
import { createEmbedding } from '../../llm.js'
import { pool } from '../../db/pool.js'

export const openNotebookEmbeddingRouter = Router()

function authorized(header: string | undefined): boolean {
  const expected = process.env.OPEN_NOTEBOOK_PASSWORD ?? ''
  const actual = header?.replace(/^Bearer\s+/i, '') ?? ''
  const left = Buffer.from(expected)
  const right = Buffer.from(actual)
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right)
}

openNotebookEmbeddingRouter.post('/v1/embeddings', safe(async (req, res) => {
  if (!authorized(req.headers.authorization)) {
    res.status(401).json({ error: { message: 'unauthorized' } })
    return
  }
  const companyId = String(req.headers['x-lingxi-company-id'] ?? '').trim()
  const input = Array.isArray(req.body?.input) ? req.body.input : [req.body?.input]
  if (!companyId || req.body?.model !== env.OPENAI_EMBEDDING_MODEL
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
  res.json(await createEmbedding({ purpose: 'knowledge-embedding', companyId }, {
    model: env.OPENAI_EMBEDDING_MODEL,
    input,
  }))
}))
