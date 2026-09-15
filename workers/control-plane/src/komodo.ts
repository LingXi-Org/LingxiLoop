export const komodoTargetNames = [
  'lingxiloop-core-state',
  'lingxiloop-app-a',
  'server-b-ingress',
  'lingxiloop-app-b',
  'lingxiloop-knowledge-agent',
  'uptime',
] as const

export type KomodoTargetName = typeof komodoTargetNames[number]
export type KomodoEnv = {
  KOMODO_BASE_URL: string
  KOMODO_TARGETS_JSON: string
  KOMODO_API_KEY: string
  KOMODO_API_SECRET: string
}

type KomodoTarget = { stack: string }
type KomodoTargets = Record<KomodoTargetName, KomodoTarget>

function targets(env: KomodoEnv): KomodoTargets {
  const parsed = JSON.parse(env.KOMODO_TARGETS_JSON) as Record<string, unknown>
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
    || Object.keys(parsed).sort().join() !== [...komodoTargetNames].sort().join()) {
    throw new Error(`KOMODO_TARGETS_JSON must contain exactly: ${komodoTargetNames.join(', ')}`)
  }
  for (const name of komodoTargetNames) {
    const value = parsed[name] as Partial<KomodoTarget> | undefined
    if (!value || typeof value.stack !== 'string' || !value.stack.trim() || Object.keys(value).some((key) => key !== 'stack')) {
      throw new Error(`invalid Komodo target: ${name}`)
    }
  }
  return parsed as KomodoTargets
}

function baseUrl(env: KomodoEnv): URL {
  const url = new URL(env.KOMODO_BASE_URL)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('KOMODO_BASE_URL must be an HTTPS origin')
  }
  return url
}

async function request(env: KomodoEnv, kind: 'read' | 'execute', operation: string, params: unknown): Promise<unknown> {
  const response = await fetch(new URL(`/${kind}/${operation}`, baseUrl(env)), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.KOMODO_API_KEY, 'x-api-secret': env.KOMODO_API_SECRET },
    body: JSON.stringify(params),
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
  })
  const text = (await response.text()).slice(0, 262_144)
  if (!response.ok) throw new Error(`Komodo ${response.status}: ${text.slice(0, 1000)}`)
  if (!text) return { ok: true, status: response.status }
  try { return JSON.parse(text) } catch { return text }
}

function stack(env: KomodoEnv, name: KomodoTargetName): string {
  return targets(env)[name].stack
}

export function listKomodoTargets(env: KomodoEnv): Record<string, KomodoTarget> {
  return targets(env)
}

export async function inspectKomodoTarget(env: KomodoEnv, name: KomodoTargetName): Promise<unknown> {
  const value = stack(env, name)
  const [details, services, actionState] = await Promise.all([
    request(env, 'read', 'GetStack', { stack: value }),
    request(env, 'read', 'ListStackServices', { stack: value }),
    request(env, 'read', 'GetStackActionState', { stack: value }),
  ])
  return { name, stack: details, services, actionState }
}

export async function listKomodoUpdates(env: KomodoEnv, name: KomodoTargetName, limit: number): Promise<unknown> {
  const details = await request(env, 'read', 'GetStack', { stack: stack(env, name) }) as { _id?: { $oid?: string } }
  const id = details._id?.$oid
  if (!id) throw new Error(`Komodo stack has no id: ${name}`)
  const response = await request(env, 'read', 'ListUpdates', { query: { 'target.type': 'Stack', 'target.id': id }, page: 0 }) as { updates?: unknown[] }
  return { updates: (response.updates ?? []).slice(0, limit) }
}

export async function readKomodoLogs(env: KomodoEnv, name: KomodoTargetName,
  options: { service?: string; tail: number }): Promise<unknown> {
  return request(env, 'read', 'GetStackLog', { stack: stack(env, name), services: options.service ? [options.service] : [], tail: options.tail, timestamps: true })
}

export async function runKomodoStackAction(env: KomodoEnv, name: KomodoTargetName,
  action: 'deploy' | 'start' | 'stop' | 'restart'): Promise<unknown> {
  const operation = { deploy: 'DeployStack', start: 'StartStack', stop: 'StopStack', restart: 'RestartStack' }[action]
  return request(env, 'execute', operation, { stack: stack(env, name) })
}
