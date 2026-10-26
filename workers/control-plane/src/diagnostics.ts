import { z } from 'zod'
import { boundedResponseText, redact } from './mcp'

const keysSchema = z.array(z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.string().datetime(),
}).strict()).max(100)
const querySchema = z.object({
  view: z.enum(['runs', 'run', 'operations', 'llm-calls', 'delivery-failures']).default('runs'),
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().max(100).optional(),
  search: z.string().max(200).optional(),
  companyId: z.string().max(200).optional(),
  cursor: z.string().max(5000).optional(),
  afterSeq: z.coerce.number().int().nonnegative().safe().optional(),
}).strict()

export async function diagnosticCredential(request: Request, configured?: string): Promise<string | null> {
  const token = request.headers.get('authorization')?.match(/^Bearer (diag\.([a-zA-Z0-9_-]{1,64})\.[a-zA-Z0-9_-]{43})$/)
  if (!token || !configured) return null
  let keys: z.infer<typeof keysSchema>
  try { keys = keysSchema.parse(JSON.parse(configured)) } catch { return null }
  const key = keys.find(key => key.id === token[2])
  if (!key || Date.parse(key.expiresAt) <= Date.now()) return null
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token[1]))
  const hash = [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('')
  return hash === key.sha256 ? key.id : null
}

export function diagnosticPath(request: Request): string | null {
  const url = new URL(request.url)
  if (url.pathname !== '/api/diagnostics' || url.search.length > 6000) return null
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) return null
  const { view, id, afterSeq, ...filters } = parsed.data
  if (view === 'run' || view === 'operations') {
    if (!id || [...url.searchParams.keys()].some(key => key !== 'view' && key !== 'id' && !(view === 'operations' && key === 'afterSeq'))) return null
    return view === 'run' ? `/api/admin/resources/agent-runs/${id}` : `/api/admin/agent-runs/${id}/operations${afterSeq === undefined ? '' : `?afterSeq=${afterSeq}`}`
  }
  if (id || afterSeq !== undefined) return null
  const resource = view === 'runs' ? 'agent-runs' : view === 'llm-calls' ? 'llm-calls' : 'agent-deliveries'
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) if (value !== undefined) query.set(key, String(value))
  return `/api/admin/resources/${resource}?${query}`
}

export async function diagnosticResponse(response: Response, secrets: string[]): Promise<Response> {
  const headers = { 'cache-control': 'no-store' }
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel()
    return Response.json({ error: 'diagnostic upstream redirect rejected' }, { status: 502, headers })
  }
  try {
    const body: unknown = JSON.parse(await boundedResponseText(response))
    return Response.json(redact(body, secrets), { status: response.status, headers })
  } catch {
    return Response.json({ error: 'invalid or oversized diagnostic response' }, { status: 502, headers })
  }
}
