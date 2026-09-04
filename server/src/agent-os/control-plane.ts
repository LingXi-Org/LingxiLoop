import { createHash, timingSafeEqual } from 'node:crypto'
import { type NextFunction, type Request, type Response, Router } from 'express'
import { ControlPlaneError, ControlPlaneService, type LeaseProof } from '../../../third_party/lingxios/src/control-plane/service.js'
import type { AssistantMessage, RunEvent, SessionRecord, WorkCompletion } from '../../../third_party/lingxios/src/protocol/types.js'
import {
  LingxiLoopActionExecutor,
  LingxiLoopCapabilityResolver,
  LingxiLoopContextProvider,
  LingxiLoopDelivery,
  LingxiLoopEventStore,
  LingxiLoopSessionStore,
  LingxiLoopWorkStore,
  productActionLedger,
} from './control-plane-adapters.js'
import { executeActionWithLedger } from './host-action-application.js'
import { applyMemorySynthesis, loadMemorySynthesisBatch } from './memory-service.js'
import { toProductWork } from './protocol-adapter.js'
import type { MemorySynthesisChange } from './types.js'

export { executeActionWithLedger }

const workStore = new LingxiLoopWorkStore()
const service = new ControlPlaneService({
  work: workStore,
  sessions: new LingxiLoopSessionStore(),
  events: new LingxiLoopEventStore(),
  actions: productActionLedger,
  contextProvider: new LingxiLoopContextProvider(),
  actionExecutor: new LingxiLoopActionExecutor(),
  capabilityResolver: new LingxiLoopCapabilityResolver(),
  delivery: new LingxiLoopDelivery(),
})

export const agentOSControlRouter = Router()

function serviceAuthorized(req: Request): boolean {
  const expected = process.env.AGENT_OS_SERVICE_TOKEN ?? 'dev-agent-os-service-token'
  const auth = req.headers.authorization
  const provided = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (provided.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
}

agentOSControlRouter.use('/v2', (req, res, next) => {
  if (!serviceAuthorized(req)) { res.status(401).json({ error: 'invalid Agent OS service identity' }); return }
  next()
})

function safe(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res).catch((error: unknown) => {
      if (error instanceof ControlPlaneError) { res.status(error.status).json({ error: error.message }); return }
      next(error)
    })
  }
}

function proof(id: string, source: Record<string, unknown>): LeaseProof {
  return { id, fence: Number(source.fence), leaseToken: String(source.leaseToken ?? '') }
}

agentOSControlRouter.post('/v2/work', safe(async (req, res) => {
  res.json(await service.enqueue(req.body))
}))

agentOSControlRouter.post('/v2/work/claim', safe(async (req, res) => {
  res.json(await service.claim(String(req.body?.workerId ?? '')))
}))

agentOSControlRouter.get('/v2/work/:id/context', safe(async (req, res) => {
  res.json(await service.loadContext(proof(String(req.params.id), req.query as Record<string, unknown>)))
}))

agentOSControlRouter.post('/v2/work/:id/heartbeat', safe(async (req, res) => {
  res.json(await service.heartbeat(proof(String(req.params.id), req.body)))
}))

agentOSControlRouter.post('/v2/work/:id/yield', safe(async (req, res) => {
  await service.yieldWork(proof(String(req.params.id), req.body))
  res.json({ ok: true })
}))

agentOSControlRouter.post('/v2/work/:id/cancel', safe(async (req, res) => {
  res.json({ ok: await service.requestCancel(String(req.params.id)) })
}))

agentOSControlRouter.post('/v2/work/:id/preempt', safe(async (req, res) => {
  res.json({ ok: await service.requestPreempt(String(req.params.id)) })
}))

agentOSControlRouter.post('/v2/work/:id/steer', safe(async (req, res) => {
  res.json({ ok: await service.addSteer(String(req.params.id), String(req.body?.text ?? '')) })
}))

agentOSControlRouter.post('/v2/work/:id/actions', safe(async (req, res) => {
  res.json(await service.executeAction(proof(String(req.params.id), req.body), req.body.action))
}))

agentOSControlRouter.post('/v2/work/:id/events', safe(async (req, res) => {
  await service.recordEvent(proof(String(req.params.id), req.body), req.body.event as RunEvent)
  res.json({ ok: true })
}))

agentOSControlRouter.post('/v2/work/:id/messages', safe(async (req, res) => {
  await service.commitMessage(proof(String(req.params.id), req.body), req.body.message as AssistantMessage)
  res.json({ ok: true })
}))

agentOSControlRouter.post('/v2/work/:id/complete', safe(async (req, res) => {
  await service.complete(proof(String(req.params.id), req.body), {
    status: req.body.status as WorkCompletion['status'],
    ...(typeof req.body.resultText === 'string' ? { resultText: req.body.resultText } : {}),
    ...(typeof req.body.error === 'string' ? { error: req.body.error } : {}),
  })
  res.json({ ok: true })
}))

agentOSControlRouter.get('/v2/sessions/:key', safe(async (req, res) => {
  res.json({ session: await service.getSession(String(req.params.key)) })
}))

agentOSControlRouter.put('/v2/sessions', safe(async (req, res) => {
  res.json(await service.saveSession(
    proof(String(req.body?.workId ?? ''), req.body), req.body.session as SessionRecord,
  ))
}))

async function memoryWork(req: Request) {
  const lease = await workStore.getLeased(String(req.params.id), Number(req.body?.fence ?? req.query.fence), hash(String(req.body?.leaseToken ?? req.query.leaseToken ?? '')))
  if (!lease) throw new ControlPlaneError(409, 'work lease lost or expired')
  const work = toProductWork(lease.work)
  if (work.reason !== 'memory_synthesis') throw new ControlPlaneError(409, 'not a memory synthesis work item')
  return work
}

function hash(value: string): string { return createHash('sha256').update(value).digest('hex') }

agentOSControlRouter.get('/v2/work/:id/memory-synthesis', safe(async (req, res) => {
  res.json({ batch: await loadMemorySynthesisBatch(await memoryWork(req)) })
}))

agentOSControlRouter.post('/v2/work/:id/memory-synthesis', safe(async (req, res) => {
  res.json(await applyMemorySynthesis({
    work: await memoryWork(req),
    evidenceIds: Array.isArray(req.body?.evidenceIds) ? req.body.evidenceIds.map(String) : [],
    changes: req.body?.changes as MemorySynthesisChange[],
    approved: req.body?.approved === true,
    confidence: Number(req.body?.confidence ?? 0),
  }))
}))
