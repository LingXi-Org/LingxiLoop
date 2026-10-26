import { assertSource, hash, ReleaseError, requireThat, validateManifest, type Accepted } from '../../../shared/release/protocol'
import { ledgerCall, type Bootstrap, type ReleaseEnv, type ReleaseRecord } from './types'
import { handleArchive } from './archive'
import { BOOTSTRAP_PATHS, handleBootstrapArtifact } from './bootstrap-artifact'
import { PROVIDER_FETCH_PATH, handleProviderFetch } from './provider-fetch'
import { ARTIFACT_BLOB_PREFIX, handleArtifactBlob } from './artifact-blobs'
import { RETAINED_ASSETS_PATH, handleRetainedAssets } from './retained-assets'
export { ReleaseLedger } from './ledger'
export { ReleaseWorkflow } from './workflow'

async function matches(expected: string | undefined, candidate: string) {
  if (!expected || !candidate) return false
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(expected), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
  const candidateKey = await crypto.subtle.importKey('raw', encoder.encode(candidate), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.verify('HMAC', key, await crypto.subtle.sign('HMAC', candidateKey, encoder.encode('lingxi-release-auth')), encoder.encode('lingxi-release-auth'))
}
function safeRecord(record: ReleaseRecord) {
  // No host policy, credentials or full Compose config is ever returned here.
  return { releaseId: record.releaseId, appSha: record.manifest.appSha, opsSha: record.manifest.opsSha,
    status: record.status, phase: record.phase, generation: record.generation, targets: record.targets,
    createdAt: record.createdAt, updatedAt: record.updatedAt, errors: record.errors, error: record.error,
    supersededBy: record.supersededBy, workflowId: record.workflowId,
    dispatch: record.dispatch, manualInterventions: record.manualInterventions,
    progress: record.checkpoint && { protocol: 2, stage: record.checkpoint.plan[record.checkpoint.index]?.key, completed: record.checkpoint.completed, requests: record.checkpoint.requests, timings: record.checkpoint.timings, retries: record.checkpoint.retries },
    needsAgent: record.status === 'blocked', receiptKey: `releases/${record.releaseId}/verified.json` }
}
export default {
  async fetch(request: Request, env: ReleaseEnv): Promise<Response> {
    try {
      const url = new URL(request.url)
      if (url.pathname === '/healthz') return Response.json({ service: 'lingxiloop-release', protocol: 1 })
      const token = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
      const admin = await matches(env.RELEASE_ADMIN_TOKEN, token)
      if(url.pathname===RETAINED_ASSETS_PATH){
        requireThat(admin||await matches(env.RELEASE_API_TOKEN,token),'UNAUTHORIZED',401)
        return await handleRetainedAssets(request,env)
      }
      if (url.pathname.startsWith(ARTIFACT_BLOB_PREFIX)) {
        const submit = await matches(env.RELEASE_API_TOKEN, token), exec = await matches(env.EXECUTOR_TOKEN, token)
        requireThat(admin || submit || exec, 'UNAUTHORIZED', 401)
        requireThat(admin || (request.method === 'PUT' ? submit : request.method === 'HEAD' ? submit || exec : exec), 'ARTIFACT_ROLE_REQUIRED', 403)
        return await handleArtifactBlob(request, env)
      }
      if (url.pathname === PROVIDER_FETCH_PATH) {
        requireThat(admin, 'ADMIN_REQUIRED', 403)
        return await handleProviderFetch(request, env)
      }
      if (BOOTSTRAP_PATHS.includes(url.pathname)) {
        requireThat(request.method === 'PUT' ? admin : admin || await matches(env.EXECUTOR_TOKEN, token), request.method === 'PUT' ? 'ADMIN_REQUIRED' : 'UNAUTHORIZED', request.method === 'PUT' ? 403 : 401)
        return await handleBootstrapArtifact(request, env)
      }
      const archive = /^\/v1\/releases\/([A-Za-z0-9][A-Za-z0-9._-]{0,95})\/backups\/main-runtime-a$/.exec(url.pathname)
      if (archive) {
        requireThat(admin || await matches(env.EXECUTOR_TOKEN, token), 'UNAUTHORIZED', 401)
        const record = await ledgerCall<ReleaseRecord>(env, `/get?id=${encodeURIComponent(archive[1])}`)
        return await handleArchive(request, env, record)
      }
      requireThat(admin || await matches(env.RELEASE_API_TOKEN, token), 'UNAUTHORIZED', 401)
      requireThat(request.method === 'GET' || request.headers.get('content-type')?.includes('application/json'), 'JSON_REQUIRED', 415)
      if (request.method === 'GET' && url.pathname === '/v1/accepted') return Response.json(await ledgerCall(env, '/accepted'), { headers: { 'cache-control': 'no-store' } })
      if (request.method === 'POST' && url.pathname === '/v1/bootstrap') {
        requireThat(admin && env.BOOTSTRAP_ENABLED === 'true', 'ADMIN_REQUIRED', 403)
        const data = await request.json() as Bootstrap
        const evidence = await env.ARTIFACTS.head(data.evidence?.receiptKey ?? '')
        requireThat(evidence, 'IMMUTABLE_HANDOFF_EVIDENCE_REQUIRED')
        return Response.json(await ledgerCall(env, '/bootstrap', data))
      }
      if (request.method === 'POST' && ['/v1/plan', '/v1/releases'].includes(url.pathname)) {
        requireThat(Number(request.headers.get('content-length') ?? 0) <= 1_000_000, 'MANIFEST_TOO_LARGE', 413)
        const text = await request.text(); requireThat(text.length <= 1_000_000, 'MANIFEST_TOO_LARGE', 413)
        const manifest = validateManifest(JSON.parse(text))
        requireThat(env.CONTROLLER_OPS_SHA && /^[a-f0-9]{40}$/.test(env.CONTROLLER_OPS_SHA), 'CONTROLLER_VERSION_NOT_CONFIGURED')
        requireThat(manifest.opsSha === env.CONTROLLER_OPS_SHA, 'CONTROLLER_VERSION_MISMATCH')
        const accepted = await ledgerCall<Accepted>(env, '/accepted')
        if (url.pathname === '/v1/plan') { assertSource(manifest, accepted); return Response.json({ releaseId: manifest.releaseId, manifestHash: await hash(manifest), targets: Object.keys(manifest.targets), resources: [...new Set(Object.values(manifest.targets).flatMap(t => t.resources))] }) }
        const record = await ledgerCall<ReleaseRecord>(env, '/register', { manifest, manifestHash: await hash(manifest) })
        return Response.json(safeRecord(record), { status: 202 })
      }
      const match = /^\/v1\/releases\/([A-Za-z0-9][A-Za-z0-9._-]{0,95})(?:\/(events|resume|recover))?$/.exec(url.pathname)
      requireThat(match, 'NOT_FOUND', 404)
      const [, releaseId, action] = match
      if (request.method === 'POST' && ['resume', 'recover'].includes(action)) requireThat(admin, 'ADMIN_REQUIRED', 403)
      const record = await ledgerCall<ReleaseRecord>(env, `/get?id=${encodeURIComponent(releaseId)}`)
      if (request.method === 'GET' && !action) return Response.json(safeRecord(record), { headers: { 'cache-control': 'no-store' } })
      if (request.method === 'GET' && action === 'events') {
        const after = Number(url.searchParams.get('after') ?? request.headers.get('last-event-id') ?? 0)
        requireThat(Number.isSafeInteger(after) && after >= 0, 'INVALID_EVENT_CURSOR', 400)
        const events = await ledgerCall<{ seq: number; [key: string]: unknown }[]>(env, `/events?id=${releaseId}&after=${after}`)
        if (request.headers.get('accept')?.includes('text/event-stream')) {
          // Finite SSE batches have durable cursors. EventSource/CLI reconnects
          // without losing events; long waits do not hold a model turn open.
          return new Response(`retry: 3000\n\n${events.map(e => `id: ${e.seq}\nevent: release\ndata: ${JSON.stringify(e)}\n\n`).join('')}`, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' } })
        }
        return Response.json({ releaseId, events, cursor: events.at(-1)?.seq ?? after })
      }
      if (request.method === 'POST' && ['resume', 'recover'].includes(action)) {
        requireThat(admin, 'ADMIN_REQUIRED', 403)
        const instance = await env.RELEASE_WORKFLOW.get(record.workflowId)
        const observed = await instance.status()
        requireThat(['errored', 'terminated', 'complete'].includes(observed.status), 'WORKFLOW_STILL_IN_FLIGHT')
        requireThat(!['accepted', 'failed', 'recovered', 'superseded'].includes(record.status), 'RELEASE_ALREADY_TERMINAL')
        // Host keys and generations are reused. Never release locks here.
        return Response.json(safeRecord(await ledgerCall(env, '/resume', { releaseId, expectedWorkflowId: record.workflowId, recover: action === 'recover' })), { status: 202 })
      }
      throw new ReleaseError('METHOD_NOT_ALLOWED', 405)
    } catch (error) {
      const status = error instanceof ReleaseError ? error.status : (error as { status?: number }).status ?? 500
      const code = error instanceof ReleaseError ? error.code : (error as { code?: string }).code ?? 'RELEASE_API_ERROR'
      return Response.json({ error: code, needsAgent: status >= 500 }, { status })
    }
  },
} satisfies ExportedHandler<ReleaseEnv>
