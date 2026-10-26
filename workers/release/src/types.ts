import type { StageCheckpoint } from './stages'
import type { Accepted, Manifest } from '../../../shared/release/protocol'

export type ReleaseStatus = 'queued' | 'preparing' | 'waiting' | 'active' | 'accepted' | 'failed' | 'recovering' | 'recovered' | 'blocked' | 'superseded'
export type ReleaseRecord = {
  releaseId: string; manifest: Manifest; manifestHash: string; status: ReleaseStatus
  generation: number; phase: string; createdAt: number; updatedAt: number
  error: string | null; supersededBy: string | null; workflowId: string
  dispatch?: { queuedAt: number; deadline: number; attempts: number; deliveredAt?: number; lastError?: string }
  manualInterventions?: number
  checkpoint?: StageCheckpoint; resumeMode?: 'resume' | 'recover'; targets: Record<string, unknown>; errors: { forward?: string; recovery?: string; cleanup?: string }
}
export interface ReleaseEnv {
  externalFetch?: typeof fetch
  RELEASES: DurableObjectNamespace
  RELEASE_WORKFLOW: Workflow<{ releaseId: string; attempt: number }>
  ARTIFACTS: R2Bucket
  ENVIRONMENT: string
  CONTROLLER_OPS_SHA?: string
  RELEASE_API_TOKEN: string
  RELEASE_ADMIN_TOKEN: string
  EXECUTOR_TOKEN: string
  EXECUTORS_JSON: string
  CF_ACCESS_CLIENT_ID?: string
  CF_ACCESS_CLIENT_SECRET?: string
  CLOUDFLARE_API_TOKEN: string
  CLOUDFLARE_ACCOUNT_ID: string
  WORKER_NAMES_JSON: string
  PROBES_JSON: string
  BOOTSTRAP_ENABLED?: string
  MIHOMO_ORIGIN_SHA256?: string
}
export function ledger(env: ReleaseEnv) {
  return env.RELEASES.getByName(env.ENVIRONMENT)
}
export async function ledgerCall<T>(env: ReleaseEnv, path: string, data?: unknown): Promise<T> {
  const response = await ledger(env).fetch(new Request(`https://ledger${path}`, data === undefined ? undefined : {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data),
  }))
  const body = await response.json() as { error?: string }
  if (!response.ok) throw Object.assign(new Error(body.error ?? 'LEDGER_ERROR'), { code: body.error, status: response.status })
  return body as T
}
export type Bootstrap = { accepted: Accepted; evidence: { receiptKey: string; observedAt: string; handoffId: string; zeroInFlight: true } }
