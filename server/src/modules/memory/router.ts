import { Router, type Request, type Response, type NextFunction } from 'express'
import type { ZodType } from 'zod'
import type { AuthedRequest } from '../../auth.js'
import { lingxiOSControl } from '../../agent-runtime/runtime.js'
import { productRunIdentity } from '../../agent-runtime/identity.js'
import { imAccessApplication } from '../../im/access-facade.js'
import { permissionService } from '../access/public.js'
import { memoryApplySchema, memoryIdentityQuery, memoryListQuery, memoryPageQuery, memoryReadQuery, memoryRestoreSchema,
  memoryRollbackSchema, memoryScopeQuery, memoryScopeSchema, memorySearchQuery } from './contracts.js'

export const memoryRouter = Router({ mergeParams: true })
function input<T>(schema: ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw Object.assign(new Error('invalid memory request'),{ status: 400 })
  return parsed.data
}
const safe = (handler: (req: Request & AuthedRequest,res: Response)=>Promise<void>) =>
  (req: Request & AuthedRequest,res: Response,next: NextFunction) => { void handler(req,res).catch(error=>{
    if (error instanceof Error && error.message==='memory is unavailable or stale') Object.assign(error,{ status: 409 })
    if (error instanceof Error && error.message==='memory scope was revoked') Object.assign(error,{ status: 403 })
    next(error)
  }) }

async function caller(req: Request & AuthedRequest, threadId?: string, write = false) {
  const principalId = req.authUserId, companyId = String(req.headers['x-company-id'] ?? '').trim(), conversationId = String(req.params.id)
  if (!principalId) throw Object.assign(new Error('authentication required'),{ status: 401 })
  if (!companyId || !await imAccessApplication.authorize({ userId: principalId,companyId })) throw Object.assign(new Error('not a company member'),{ status: 403 })
  await permissionService.assertCan({ actorUserId: principalId,companyId,action: write ? 'agent_memory:write' : 'agent_memory:read',resource: { type: 'conversation',id: conversationId } })
  const run = await productRunIdentity({ companyId,conversationId,principalId,agentId: String(req.params.agentId),runId: String(req.params.runId),...threadId ? { threadId } : {} })
  const app = await lingxiOSControl()
  if (!app.memory) throw Object.assign(new Error('memory is unavailable'),{ status: 503 })
  const { runId,...identity }=run
  return { app,api: app.memory,identity: { ...identity,workId: runId },scope: (scopeType: string,scopeId: string)=>({ tenantId: companyId,scopeType,scopeId }) }
}

memoryRouter.get('/scopes',safe(async(req,res)=>{
  const { threadId }=input(memoryIdentityQuery,req.query), { api,identity }=await caller(req,threadId)
  res.json(await api.scopes(identity))
}))
memoryRouter.get('/documents',safe(async(req,res)=>{
  const { threadId,scopeType,scopeId,...query }=input(memoryListQuery,req.query), { api,identity,scope }=await caller(req,threadId)
  res.json(await api.list(identity,scope(scopeType,scopeId),query))
}))
memoryRouter.get('/documents/:memoryId',safe(async(req,res)=>{
  const { threadId,scopeType,scopeId,version }=input(memoryReadQuery,req.query), { api,identity,scope }=await caller(req,threadId)
  const document=await api.read(identity,scope(scopeType,scopeId),String(req.params.memoryId),version)
  if (!document) { res.status(404).json({ error: 'memory document not found' }); return }
  res.json(document)
}))
memoryRouter.get('/documents/:memoryId/history',safe(async(req,res)=>{
  const { threadId,scopeType,scopeId,...query }=input(memoryPageQuery,req.query), { api,identity,scope }=await caller(req,threadId)
  res.json(await api.history(identity,scope(scopeType,scopeId),String(req.params.memoryId),query))
}))
memoryRouter.get('/search',safe(async(req,res)=>{
  const { threadId,scopeType,scopeId,...query }=input(memorySearchQuery,req.query), { api,identity,scope }=await caller(req,threadId)
  res.json(await api.search(identity,scope(scopeType,scopeId),query))
}))
memoryRouter.get('/doctor',safe(async(req,res)=>{
  const { threadId,scopeType,scopeId,cursor }=input(memoryPageQuery,req.query), { api,identity,scope }=await caller(req,threadId)
  res.json(await api.doctor(identity,scope(scopeType,scopeId),cursor))
}))
memoryRouter.post('/apply',safe(async(req,res)=>{
  const { threadId }=input(memoryIdentityQuery,req.query), { api,identity }=await caller(req,threadId,true)
  const change=input(memoryApplySchema,req.body)
  res.json(await api.apply(identity,{ ...change,sourceRef: `user:${identity.principalId}:memory:${identity.workId}` }))
}))
memoryRouter.post('/restore',safe(async(req,res)=>{
  const { threadId }=input(memoryIdentityQuery,req.query), { api,identity }=await caller(req,threadId,true)
  const change=input(memoryRestoreSchema,req.body)
  res.json(await api.restore(identity,{ ...change,sourceRef: `user:${identity.principalId}:memory:${identity.workId}` }))
}))
memoryRouter.post('/reflect',safe(async(req,res)=>{
  const { threadId }=input(memoryIdentityQuery,req.query), { api,identity }=await caller(req,threadId,true)
  res.json(await api.reflect(identity,input(memoryScopeSchema,req.body)))
}))
memoryRouter.post('/forget',safe(async(req,res)=>{
  const { threadId }=input(memoryIdentityQuery,req.query), { api,identity }=await caller(req,threadId,true)
  res.json(await api.forget(identity,input(memoryScopeSchema,req.body)))
}))
memoryRouter.get('/evolution',safe(async(req,res)=>{
  const { threadId,scopeType,scopeId }=input(memoryScopeQuery,req.query), { app,api,identity,scope }=await caller(req,threadId)
  const selected=scope(scopeType,scopeId)
  if (!(await api.scopes(identity)).some(item=>item.tenantId===selected.tenantId && item.scopeType===scopeType && item.scopeId===scopeId)) throw Object.assign(new Error('memory scope was revoked'),{ status: 403 })
  res.json(await app.readEvolution(selected))
}))
memoryRouter.post('/evolution/rollback',safe(async(req,res)=>{
  const { threadId }=input(memoryIdentityQuery,req.query), { app,api,identity }=await caller(req,threadId,true)
  const { scope,activeId,expectedVersion,targetId }=input(memoryRollbackSchema,req.body)
  if (!(await api.scopes(identity)).some(item=>item.tenantId===scope.tenantId && item.scopeType===scope.scopeType && item.scopeId===scope.scopeId)) throw Object.assign(new Error('memory scope was revoked'),{ status: 403 })
  res.json(await app.rollbackEvolution(scope,activeId,expectedVersion,targetId))
}))
