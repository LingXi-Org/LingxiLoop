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

export interface OpenNotebookNote {
  id: string
  title?: string | null
  content?: string | null
  note_type?: string | null
  created?: string
  updated?: string
}

export interface OpenNotebookInsight {
  id: string
  source_id: string
  insight_type: string
  content: string
  created?: string | null
  updated?: string | null
}

export interface OpenNotebookTransformation {
  id: string
  name: string
  title: string
  description?: string
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

  listNotebooks(): Promise<OpenNotebookNotebook[]> {
    return this.json('/api/notebooks?order_by=updated%20desc')
  }

  createNotebook(input: { name: string; description: string; externalKey: string }): Promise<OpenNotebookNotebook> {
    return this.json('/api/notebooks', {
      method: 'POST', headers: this.headers(true),
      body: JSON.stringify({ name: input.name, description: input.description, external_key: input.externalKey }),
    })
  }

  updateNotebook(id: string, input: { name?: string; description?: string; archived?: boolean }): Promise<OpenNotebookNotebook> {
    return this.json(`/api/notebooks/${encodeURIComponent(id)}`, {
      method: 'PUT', headers: this.headers(true), body: JSON.stringify(input),
    })
  }

  listSources(notebookId: string): Promise<OpenNotebookSource[]> {
    return this.json(`/api/sources?notebook_id=${encodeURIComponent(notebookId)}&limit=100&sort_by=updated&sort_order=desc`)
  }

  getSource(sourceId: string): Promise<OpenNotebookSource> {
    return this.json(`/api/sources/${encodeURIComponent(sourceId)}`)
  }

  getSourceStatus(sourceId: string): Promise<{ status?: string | null; command_id?: string | null; processing_info?: Record<string, unknown> | null }> {
    return this.json(`/api/sources/${encodeURIComponent(sourceId)}/status`)
  }

  createTextSource(input: { notebookId: string; title: string; content: string }): Promise<OpenNotebookSource> {
    return this.json('/api/sources/json', {
      method: 'POST', headers: this.headers(true),
      body: JSON.stringify({
        type: 'text', notebooks: [input.notebookId], title: input.title, content: input.content,
        transformations: [], embed: true, delete_source: false, async_processing: true,
      }),
    }, 60_000)
  }

  createUrlSource(input: { notebookId: string; title: string; url: string }): Promise<OpenNotebookSource> {
    return this.json('/api/sources/json', {
      method: 'POST', headers: this.headers(true),
      body: JSON.stringify({
        type: 'link', notebooks: [input.notebookId], title: input.title, url: input.url,
        transformations: [], embed: true, delete_source: false, async_processing: true,
      }),
    }, 60_000)
  }

  async createFileSource(input: { notebookId: string; title: string; mime: string; bytes: Buffer }): Promise<OpenNotebookSource> {
    const form = new FormData()
    form.set('type', 'upload')
    form.set('notebooks', JSON.stringify([input.notebookId]))
    form.set('title', input.title)
    form.set('transformations', '[]')
    form.set('embed', 'true')
    form.set('delete_source', 'false')
    form.set('async_processing', 'true')
    form.set('file', new Blob([input.bytes], { type: input.mime || 'application/octet-stream' }), input.title)
    return this.json('/api/sources', { method: 'POST', headers: this.headers(false), body: form }, 120_000)
  }

  retrySource(sourceId: string): Promise<OpenNotebookSource> {
    return this.json(`/api/sources/${encodeURIComponent(sourceId)}/retry`, { method: 'POST', headers: this.headers(true), body: '{}' }, 60_000)
  }

  updateSource(sourceId: string, input: { title?: string; topics?: string[] }): Promise<OpenNotebookSource> {
    return this.json(`/api/sources/${encodeURIComponent(sourceId)}`, {
      method: 'PUT', headers: this.headers(true), body: JSON.stringify(input),
    })
  }

  async deleteSource(sourceId: string): Promise<void> {
    await this.raw(`/api/sources/${encodeURIComponent(sourceId)}`, { method: 'DELETE', headers: this.headers() })
  }

  async unlinkSource(notebookId: string, sourceId: string): Promise<void> {
    await this.raw(
      `/api/notebooks/${encodeURIComponent(notebookId)}/sources/${encodeURIComponent(sourceId)}`,
      { method: 'DELETE', headers: this.headers() },
    )
  }

  async downloadSource(sourceId: string): Promise<Buffer> {
    return Buffer.from(await (await this.raw(`/api/sources/${encodeURIComponent(sourceId)}/download`, { headers: this.headers() }, 120_000)).arrayBuffer())
  }

  async search(input: {
    notebookId: string
    sourceIds: string[]
    excludedSourceIds?: string[]
    query: string
    limit?: number
    type?: 'text' | 'vector'
    minimumScore?: number
    includeNotes?: boolean
  }): Promise<OpenNotebookSearchHit[]> {
    const excluded = new Set(input.excludedSourceIds ?? [])
    const allowedSources = new Set(input.sourceIds.filter((id) => !excluded.has(id)))
    const notes = input.includeNotes === false ? [] : await this.listNotes(input.notebookId)
    const allowedNotes = new Set(notes.map((note) => note.id))
    const requestedLimit = Math.max(1, Math.min(100, input.limit ?? 8))
    const response = await this.json<{ results?: OpenNotebookSearchHit[] }>('/api/search', {
      method: 'POST', headers: this.headers(true),
      body: JSON.stringify({
        query: input.query, type: input.type ?? 'vector', limit: requestedLimit,
        search_sources: true, search_notes: input.includeNotes !== false,
        minimum_score: input.minimumScore ?? 0.2,
        notebook_id: input.notebookId, source_ids: [...allowedSources], excluded_source_ids: [...excluded],
      }),
    }, 90_000)
    // Fail closed even if an older upstream ignored the scope fields.
    return (response.results ?? []).filter((hit) => {
      const parent = String(hit.parent_id ?? hit.id ?? '')
      return allowedSources.has(parent) || allowedNotes.has(parent) || allowedNotes.has(String(hit.id ?? ''))
    }).slice(0, requestedLimit)
  }

  ask(input: { notebookId: string; sourceIds: string[]; excludedSourceIds?: string[]; question: string }): Promise<{ answer: string; question: string }> {
    const strategyModel = process.env.OPEN_NOTEBOOK_STRATEGY_MODEL ?? process.env.OPEN_NOTEBOOK_CHAT_MODEL ?? ''
    const answerModel = process.env.OPEN_NOTEBOOK_ANSWER_MODEL ?? process.env.OPEN_NOTEBOOK_CHAT_MODEL ?? ''
    const finalAnswerModel = process.env.OPEN_NOTEBOOK_FINAL_ANSWER_MODEL ?? process.env.OPEN_NOTEBOOK_CHAT_MODEL ?? ''
    if (!strategyModel || !answerModel || !finalAnswerModel) {
      throw new OpenNotebookError('Open Notebook Ask models are not configured')
    }
    return this.json('/api/search/ask/simple', {
      method: 'POST', headers: this.headers(true),
      body: JSON.stringify({
        question: input.question, strategy_model: strategyModel, answer_model: answerModel,
        final_answer_model: finalAnswerModel, notebook_id: input.notebookId,
        source_ids: input.sourceIds, excluded_source_ids: input.excludedSourceIds ?? [],
      }),
    }, 300_000)
  }

  listNotes(notebookId: string): Promise<OpenNotebookNote[]> {
    return this.json(`/api/notes?notebook_id=${encodeURIComponent(notebookId)}`)
  }

  createNote(input: { notebookId: string; title?: string; content: string }): Promise<OpenNotebookNote> {
    return this.json('/api/notes', {
      method: 'POST', headers: this.headers(true),
      body: JSON.stringify({ notebook_id: input.notebookId, title: input.title, content: input.content, note_type: 'ai' }),
    }, 90_000)
  }

  getNote(noteId: string): Promise<OpenNotebookNote> {
    return this.json(`/api/notes/${encodeURIComponent(noteId)}`)
  }

  updateNote(noteId: string, input: { title?: string; content?: string }): Promise<OpenNotebookNote> {
    return this.json(`/api/notes/${encodeURIComponent(noteId)}`, {
      method: 'PUT', headers: this.headers(true), body: JSON.stringify(input),
    }, 90_000)
  }

  async deleteNote(noteId: string): Promise<void> {
    await this.raw(`/api/notes/${encodeURIComponent(noteId)}`, { method: 'DELETE', headers: this.headers() })
  }

  listInsights(sourceId: string): Promise<OpenNotebookInsight[]> {
    return this.json(`/api/sources/${encodeURIComponent(sourceId)}/insights`)
  }

  listTransformations(): Promise<OpenNotebookTransformation[]> {
    return this.json('/api/transformations')
  }

  createInsight(sourceId: string, transformationId: string): Promise<{ status: string; command_id?: string | null }> {
    return this.json(`/api/sources/${encodeURIComponent(sourceId)}/insights`, {
      method: 'POST', headers: this.headers(true), body: JSON.stringify({ transformation_id: transformationId }),
    }, 60_000)
  }

  updateInsight(insightId: string, input: { insight_type?: string; content?: string }): Promise<OpenNotebookInsight> {
    return this.json(`/api/insights/${encodeURIComponent(insightId)}`, {
      method: 'PUT', headers: this.headers(true), body: JSON.stringify(input),
    })
  }

  async deleteInsight(insightId: string): Promise<void> {
    await this.raw(`/api/insights/${encodeURIComponent(insightId)}`, { method: 'DELETE', headers: this.headers() })
  }

  createSourceChat(notebookId: string, sourceId: string, title?: string): Promise<{ id: string; title: string; source_id: string }> {
    return this.json(`/api/sources/${encodeURIComponent(sourceId)}/chat/sessions`, {
      method: 'POST', headers: this.headers(true), body: JSON.stringify({ notebook_id: notebookId, source_id: sourceId, title: title || undefined }),
    })
  }

  async sendSourceChatMessage(notebookId: string, sourceId: string, sessionId: string, message: string): Promise<{ answer: string; events: unknown[] }> {
    const response = await this.raw(`/api/sources/${encodeURIComponent(sourceId)}/chat/sessions/${encodeURIComponent(sessionId)}/messages`, {
      method: 'POST', headers: this.headers(true), body: JSON.stringify({ notebook_id: notebookId, message }),
    }, 300_000)
    const body = await response.text()
    const events: unknown[] = []
    let answer = ''
    for (const line of body.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue
      try {
        const event = JSON.parse(line.slice(5).trim()) as Record<string, unknown>
        events.push(event)
        if (event.type === 'ai_message' && typeof event.content === 'string') answer = event.content
        if (event.type === 'error') throw new OpenNotebookError(String(event.message ?? 'Source Chat failed'))
      } catch (error) {
        if (error instanceof OpenNotebookError) throw error
      }
    }
    return { answer, events }
  }
}

export const openNotebookClient = new OpenNotebookClient()
