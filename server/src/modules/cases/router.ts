import { Router } from 'express'
import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { safe } from '../../http/async-handler.js'
import { requireCompany } from '../../http/request-context.js'
import { storage } from '../../storage.js'
import { CasesApplication } from './application.js'
import { caseContentSchema,caseSaveSchema,caseVersionSchema,caseImageSchema } from './contracts.js'
export const casesRouter = Router()
const app = new CasesApplication(pool, { transaction: work => withTransaction(pool,work), putObject: async (key,body,mime) => { await storage.put(key,body,mime) } })
casesRouter.get('/cases',safe(async (req,res) => { res.json(await app.list(await requireCompany(req),typeof req.query.q==='string'?req.query.q:'',typeof req.query.category==='string'?req.query.category:'')) }))
casesRouter.get('/cases/:id',safe(async (req,res) => { res.json(await app.detail(await requireCompany(req),String(req.params.id))) }))
casesRouter.post('/cases',safe(async (req,res) => { res.status(201).json(await app.create(await requireCompany(req),caseContentSchema.parse(req.body))) }))
casesRouter.put('/cases/:id',safe(async (req,res) => { const {version,...content}=caseSaveSchema.parse(req.body); res.json(await app.save(await requireCompany(req),String(req.params.id),content,version)) }))
for (const [path,method] of [['publish','publish'],['unpublish','unpublish'],['retry-index','retry']] as const) {
  casesRouter.post(`/cases/:id/${path}`,safe(async (req,res) => { const {version}=caseVersionSchema.parse(req.body); res.json(await app[method](await requireCompany(req),String(req.params.id),version)) }))
}
casesRouter.post('/cases/:id/images',safe(async (req,res) => { const {mime,data}=caseImageSchema.parse(req.body); res.status(201).json(await app.uploadImage(await requireCompany(req),String(req.params.id),mime,data)) }))
