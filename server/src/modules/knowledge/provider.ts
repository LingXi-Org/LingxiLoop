/**
 * Typed, server-only adapter for the vendored Open Notebook API.
 *
 * Tenant scope is supplied by LingxiLoop and is also re-checked on every
 * response. Open Notebook performs the primary filter in SurrealDB; this
 * adapter check is an independent fail-closed tenant-isolation invariant.
 */

export interface OpenNotebookNotebook {
  id: string
  name: string
  description: string
  archived: boolean
  external_key?: string | null
}

type CreateNotebookOverride = ((input: { name: string; description: string; externalKey: string }) => Promise<OpenNotebookNotebook>) | null
let createNotebookOverride: CreateNotebookOverride = null
type UpdateNotebookOverride = ((id: string, input: { name?: string; description?: string; archived?: boolean }) => Promise<OpenNotebookNotebook>) | null
let updateNotebookOverride: UpdateNotebookOverride = null

export function __setCreateNotebookOverrideForTesting(override: CreateNotebookOverride): void {
  createNotebookOverride = override
}

export function __setUpdateNotebookOverrideForTesting(override: UpdateNotebookOverride): void {
  updateNotebookOverride = override
}

export interface OpenNotebookSource {
  id: string
  title?: string | null
  topics?: string[] | null
  asset?: { file_path?: string | null; url?: string | null } | null
  full_text?: string | null
  embedded?: boolean
  embedded_chunks?: number
  status?: string | null
  command_id?: string | null
  processing_info?: Record<string, unknown> | null
  created?: string
  updated?: string
}

export interface OpenNotebookPresentationMaterialBlock {
  chunk_id: string
  ordinal: number
  text: string
  page_number?: number | null
  section_title?: string | null
}

export interface OpenNotebookPresentationMaterialAsset {
  asset_id: string
  mime_type: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml'
  data_uri: string
  page_number?: number | null
  section_title?: string | null
  width?: number | null
  height?: number | null
}

export interface OpenNotebookPresentationMaterialV1 {
  version: 'PresentationMaterialV1'
  source_id: string
  title: string
  blocks: OpenNotebookPresentationMaterialBlock[]
  assets: OpenNotebookPresentationMaterialAsset[]
  truncated: boolean
}

export interface OpenNotebookSearchHit {
  id?: string
  parent_id?: string
  title?: string
  content?: string
  matches?: string[] | string
  similarity?: number
  relevance?: number
  [key: string]: unknown
}

export class OpenNotebookError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'OpenNotebookError'
  }
}

function trimBase(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function timeoutSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(Math.max(1_000, timeoutMs))
}

function detail(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  const row = value as Record<string, unknown>
  return typeof row.detail === 'string' ? row.detail : typeof row.error === 'string' ? row.error : ''
}

const UPLOAD_SUFFIX_BY_MIME: Readonly<Record<string, string>> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/csv': 'csv',
  'application/json': 'json',
}

function canonicalUploadFilename(title: string, mime: string): string {
  const suffix = UPLOAD_SUFFIX_BY_MIME[mime]
  if (!suffix) throw new OpenNotebookError(`Unsupported knowledge source MIME type: ${mime}`)
  const base = title.trim() || 'source'
  return base.toLowerCase().endsWith(`.${suffix}`) ? base : `${base}.${suffix}`
}

export class OpenNotebookClient {
  private readonly baseUrl: string
  private readonly password: string

  constructor(options: { baseUrl?: string; password?: string } = {}) {
    this.baseUrl = trimBase(options.baseUrl ?? process.env.OPEN_NOTEBOOK_URL ?? 'http://open-notebook:5055')
    this.password = options.password ?? process.env.OPEN_NOTEBOOK_PASSWORD ?? ''
  }

  private headers(json = false): Headers {
    const headers = new Headers({ accept: 'application/json' })
    if (json) headers.set('content-type', 'application/json')
    if (this.password) headers.set('authorization', `Bearer ${this.password}`)
    return headers
  }

  private sourceHeaders(json: boolean, idempotencyKey: string): Headers {
    const headers = this.headers(json)
    headers.set('idempotency-key', idempotencyKey)
    return headers
  }

  private async raw(path: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<Response> {
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: init.headers ?? this.headers(typeof init.body === 'string'),
        signal: init.signal ?? timeoutSignal(timeoutMs),
      })
    } catch (error) {
      throw new OpenNotebookError(`Open Notebook unavailable: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      let parsed: unknown = null
      try { parsed = JSON.parse(body) } catch { /* plain-text upstream error */ }
      throw new OpenNotebookError(detail(parsed) || body.slice(0, 1_000) || `HTTP ${response.status}`, response.status)
    }
    return response
  }

  private async json<T>(path: string, init: RequestInit = {}, timeoutMs?: number): Promise<T> {
    return (await this.raw(path, init, timeoutMs)).json() as Promise<T>
  }

  async health(): Promise<boolean> {
    try { await this.raw('/health', {}, 5_000); return true } catch { return false }
  }

  async ready(): Promise<boolean> {
    try { await this.raw('/readyz', {}, 30_000); return true } catch { return false }
  }

  createNotebook(input: { name: string; description: string; externalKey: string }): Promise<OpenNotebookNotebook> {
    if (createNotebookOverride) return createNotebookOverride(input)
    return this.json('/api/notebooks', {
      method: 'POST', headers: this.headers(true),
      body: JSON.stringify({ name: input.name, description: input.description, external_key: input.externalKey }),
    })
  }

  updateNotebook(id: string, input: { name?: string; description?: string; archived?: boolean }): Promise<OpenNotebookNotebook> {
    if (updateNotebookOverride) return updateNotebookOverride(id, input)
    return this.json(`/api/notebooks/${encodeURIComponent(id)}`, {
      method: 'PUT', headers: this.headers(true), body: JSON.stringify(input),
    })
  }

  getSource(sourceId: string): Promise<OpenNotebookSource> {
    return this.json(`/api/sources/${encodeURIComponent(sourceId)}`)
  }

  getPresentationMaterial(sourceId: string): Promise<OpenNotebookPresentationMaterialV1> {
    return this.json(`/api/sources/${encodeURIComponent(sourceId)}/presentation-material`, {}, 90_000)
  }

  getSourceStatus(sourceId: string): Promise<{ status?: string | null; command_id?: string | null; processing_info?: Record<string, unknown> | null }> {
    return this.json(`/api/sources/${encodeURIComponent(sourceId)}/status`)
  }

  createTextSource(input: {
    notebookId: string; title: string; content: string; idempotencyKey: string; companyId: string
  }): Promise<OpenNotebookSource> {
    return this.json('/api/sources/json', {
      method: 'POST', headers: this.sourceHeaders(true, input.idempotencyKey),
      body: JSON.stringify({
        type: 'text', notebooks: [input.notebookId], title: input.title, content: input.content, company_id: input.companyId,
      }),
    }, 60_000)
  }

  createUrlSource(input: {
    notebookId: string; title: string; url: string; idempotencyKey: string; companyId: string
  }): Promise<OpenNotebookSource> {
    return this.json('/api/sources/json', {
      method: 'POST', headers: this.sourceHeaders(true, input.idempotencyKey),
      body: JSON.stringify({
        type: 'link', notebooks: [input.notebookId], title: input.title, url: input.url, company_id: input.companyId,
      }),
    }, 60_000)
  }

  createFileSource(input: {
    notebookId: string; title: string; mime: string; storageKey: string; size: number; idempotencyKey: string; companyId: string
  }): Promise<OpenNotebookSource> {
    return this.json('/api/sources/json', {
      method: 'POST', headers: this.sourceHeaders(true, input.idempotencyKey),
      body: JSON.stringify({
        type: 'file', notebooks: [input.notebookId], title: input.title,
        storage_key: input.storageKey, filename: canonicalUploadFilename(input.title, input.mime),
        mime_type: input.mime, size_bytes: input.size,
        company_id: input.companyId,
      }),
    }, 60_000)
  }

  retrySource(sourceId: string): Promise<OpenNotebookSource> {
    return this.json(`/api/sources/${encodeURIComponent(sourceId)}/retry`, { method: 'POST', headers: this.headers(true), body: '{}' }, 60_000)
  }

  async deleteSource(sourceId: string): Promise<void> {
    await this.raw(`/api/sources/${encodeURIComponent(sourceId)}`, { method: 'DELETE', headers: this.headers() })
  }

  async search(input: {
    notebookId: string
    sourceIds: string[]
    query: string
    limit?: number
    type?: 'text' | 'vector'
    minimumScore?: number
    companyId: string
  }): Promise<OpenNotebookSearchHit[]> {
    const allowedSources = new Set(input.sourceIds)
    if (allowedSources.size === 0) return []
    const requestedLimit = Math.max(1, Math.min(100, input.limit ?? 8))
    const response = await this.json<{ results?: OpenNotebookSearchHit[] }>('/api/search', {
      method: 'POST', headers: this.headers(true),
      body: JSON.stringify({
        query: input.query, type: input.type ?? 'vector', limit: requestedLimit,
        minimum_score: input.minimumScore ?? 0.2,
        notebook_id: input.notebookId, source_ids: [...allowedSources],
        company_id: input.companyId,
      }),
    }, 90_000)
    // Fail closed even if an older upstream ignored the scope fields.
    return (response.results ?? []).filter((hit) => {
      const parent = String(hit.parent_id ?? hit.id ?? '')
      return allowedSources.has(parent)
    }).slice(0, requestedLimit)
  }
}

export const openNotebookClient = new OpenNotebookClient()
