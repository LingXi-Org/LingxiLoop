import { createHash } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import { createPermissionService } from '../access/public.js'
import { KnowledgeApplicationError } from './application.js'
import type { KnowledgeScope, KnowledgeSourceSearch, SourceSearchInput } from './contracts.js'
import { OpenNotebookError, type OpenNotebookClient, type OpenNotebookSource } from './provider.js'
import { findKnowledgeSourceIndexState, type KnowledgeSourceIndexState } from './retrieval-repository.js'

export function verifiedTextAnchor(text: string, excerpt: string): { type: 'extracted_text'; start: number; end: number } | null {
  if (!excerpt) return null
  const start = text.indexOf(excerpt)
  if (start < 0 || text.indexOf(excerpt, start + 1) !== -1) return null
  return { type: 'extracted_text', start, end: start + excerpt.length }
}

function indexVersion(source: KnowledgeSourceIndexState, external: OpenNotebookSource): string {
  // Upstream GET stamps last_viewed_at, which also changes `updated`; it is not an index version.
  // Product retry/completion changes updatedAt. Include the actual text and command for the snapshot.
  return createHash('sha256').update(JSON.stringify([
    source.id, source.externalSourceId, source.updatedAt, source.chunkCount,
    external.command_id ?? null, external.embedded_chunks ?? 0, external.full_text ?? null,
  ])).digest('hex')
}

function hasReadyIndex(external: OpenNotebookSource): boolean {
  return !!external.full_text && Number.isSafeInteger(external.embedded_chunks) && (external.embedded_chunks ?? 0) > 0
    && !['failed', 'error', 'cancelled', 'running', 'processing', 'pending', 'queued'].includes(external.status ?? '')
}

export class KnowledgeSourceSearchApplication {
  constructor(private readonly db: Queryable, private readonly infrastructure: {
    notebookEnabled(): boolean
    ensureNotebook(projectId: string, companyId: string): Promise<string>
    client: Pick<OpenNotebookClient, 'search' | 'getSource'>
  }) {}

  private async upstream<T>(read: () => Promise<T>, signal?: AbortSignal): Promise<T | null> {
    try { return await read() }
    catch (error) {
      signal?.throwIfAborted()
      if (error instanceof OpenNotebookError && error.status === 404) return null
      throw new KnowledgeApplicationError('unavailable', 'Knowledge search is temporarily unavailable')
    }
  }

  async search(scope: KnowledgeScope, sourceId: string, input: SourceSearchInput, signal?: AbortSignal): Promise<KnowledgeSourceSearch> {
    const sourceState = async () => {
      signal?.throwIfAborted()
      await createPermissionService(this.db).assertCan({ actorUserId: scope.userId, action: 'knowledge:read',
        companyId: scope.companyId, projectId: scope.projectId })
      const source = await findKnowledgeSourceIndexState(this.db, { ...scope, sourceId })
      if (!source) throw new KnowledgeApplicationError('not_found', 'source not found')
      return source
    }
    const empty = (status: KnowledgeSourceSearch['status']): KnowledgeSourceSearch => ({
      sourceId, indexVersion: null, status, extractedText: null, matches: [],
    })
    const before = await sourceState()
    if (before.status !== 'ready' || !before.externalSourceId || before.chunkCount < 1) {
      return empty(['queued', 'processing'].includes(before.status) ? 'processing' : 'not_indexed')
    }
    if (!this.infrastructure.notebookEnabled()) throw new KnowledgeApplicationError('unavailable', 'Open Notebook knowledge engine is disabled')
    const externalSourceId = before.externalSourceId
    const external = await this.upstream(() => this.infrastructure.client.getSource(externalSourceId, signal), signal)
    if (!external || external.id !== externalSourceId || !hasReadyIndex(external)) return empty('stale')
    const extractedText = external.full_text!
    const version = indexVersion(before, external)
    if (input.indexVersion && input.indexVersion !== version) return empty('stale')
    const notebookId = await this.upstream(() => this.infrastructure.ensureNotebook(scope.projectId, scope.companyId), signal)
    if (!notebookId) return empty('stale')
    const hits = await this.upstream(() => this.infrastructure.client.search({
      notebookId, sourceIds: [externalSourceId], companyId: scope.companyId,
      query: input.query, limit: input.limit, type: 'vector',
      minimumScore: Number(process.env.OPEN_NOTEBOOK_MINIMUM_SCORE ?? 0.2), signal,
    }), signal)
    if (!hits) return empty('stale')
    const currentExternal = await this.upstream(() => this.infrastructure.client.getSource(externalSourceId, signal), signal)
    const after = await sourceState()
    if (after.status !== 'ready' || !currentExternal || currentExternal.id !== externalSourceId || !hasReadyIndex(currentExternal)
      || indexVersion(after, currentExternal) !== version) return empty('stale')
    const seen = new Set<string>()
    const matches = hits.flatMap(hit => {
      // Defense in depth if an older provider ignores the single-source allowlist.
      if (hit.parent_id !== externalSourceId || typeof hit.id !== 'string' || !hit.id
        || typeof hit.content !== 'string' || !hit.content.trim() || seen.has(hit.id)) return []
      seen.add(hit.id)
      // PDF ingestion carries page markers into chunks; remove that prefix for verified text matching,
      // without promoting it to a page or layout coordinate.
      const excerpt = (before.mimeType === 'application/pdf'
        ? hit.content.replace(/^\[\[PAGE\s*:\s*\d+\]\]\s*/, '') : hit.content).trim()
      if (!excerpt) return []
      return [{ sourceId, sourceTitle: after.title, chunkId: hit.id, excerpt,
        anchor: verifiedTextAnchor(extractedText, excerpt) }]
    }).slice(0, input.limit)
    return { sourceId, indexVersion: version, status: matches.length ? 'matched' : 'no_matches',
      extractedText, matches }
  }
}
