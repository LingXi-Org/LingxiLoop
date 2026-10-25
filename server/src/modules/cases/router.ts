import { Router } from 'express'
import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { safe } from '../../http/async-handler.js'
import { requireCompany,requireAuth } from '../../http/request-context.js'
import { storage } from '../../storage.js'
import { CasesApplication } from './application.js'
import { caseContentSchema,caseSaveSchema,caseVersionSchema,caseViewSchema,caseImageSchema,caseFileSchema,caseCoverRetrySchema,caseCoverBackfillSchema,caseCoverAssetSchema } from './contracts.js'
export const casesRouter = Router()
const app = new CasesApplication(pool, { transaction: work => withTransaction(pool,work), putObject: async (key,body,mime) => { await storage.put(key,body,mime) } })
casesRouter.get('/cases',safe(async (req,res) => { res.json(await app.list(await requireCompany(req),typeof req.query.q==='string'?req.query.q:'',typeof req.query.category==='string'?req.query.category:'',caseViewSchema.parse(req.query.view))) }))
casesRouter.get('/cases/:id',safe(async (req,res) => { res.json(await app.detail(await requireCompany(req),String(req.params.id),caseViewSchema.parse(req.query.view))) }))
casesRouter.post('/cases',safe(async (req,res) => { res.status(201).json(await app.create(await requireCompany(req),caseContentSchema.parse(req.body))) }))
casesRouter.put('/cases/:id',safe(async (req,res) => { const {version,...content}=caseSaveSchema.parse(req.body); res.json(await app.save(await requireCompany(req),String(req.params.id),content,version)) }))
casesRouter.delete('/cases/:id',safe(async (req,res) => { const {version}=caseVersionSchema.parse(req.body); res.json(await app.remove(await requireCompany(req),String(req.params.id),version)) }))
for (const [path,method] of [['publish','publish'],['unpublish','unpublish'],['retry-index','retry']] as const) {
  casesRouter.post(`/cases/:id/${path}`,safe(async (req,res) => { const {version}=caseVersionSchema.parse(req.body); res.json(await app[method](await requireCompany(req),String(req.params.id),version)) }))
}
casesRouter.post('/cases/:id/files',safe(async (req,res) => { const {mime,data}=caseFileSchema.parse(req.body); res.status(201).json(await app.uploadFile(await requireCompany(req),String(req.params.id),mime,data)) }))
casesRouter.post('/cases/:id/images',safe(async (req,res) => { const {mime,data}=caseImageSchema.parse(req.body); res.status(201).json(await app.uploadImage(await requireCompany(req),String(req.params.id),mime,data)) }))

casesRouter.post('/cases/:id/retry-cover',safe(async (req,res) => {
  const input = caseCoverRetrySchema.parse(req.body)
  res.json(await app.retryCover(await requireCompany(req),String(req.params.id),input.snapshot,input.fingerprint,input.expectedGeneration,input.idempotencyKey))
}))
casesRouter.post('/cases/covers/backfill',safe(async (req,res) => {
  const input = caseCoverBackfillSchema.parse(req.body)
  res.json(await app.backfillCovers(await requireCompany(req),input.afterId,input.limit))
}))
casesRouter.get('/cases/:id/cover/assets/:jobId/:generation/:kind',safe(async (req,res) => {
  const input = caseCoverAssetSchema.parse({ snapshot:req.query.snapshot,generation:req.params.generation,kind:req.params.kind })
  const id = String(req.params.id)
  const scope = await app.coverAssetScope(requireAuth(req),id)
  const body = await app.coverAsset(scope,id,String(req.params.jobId),input.generation,input.kind,input.snapshot)
  res.set({ 'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':"default-src 'none'; sandbox; frame-ancestors 'none'",'Cross-Origin-Resource-Policy':'same-origin' })
  if (input.kind==='interactive') res.json({ html:body })
  else res.type('image/svg+xml').send(body)
}))
