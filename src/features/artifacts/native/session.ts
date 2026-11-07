import {artifactPageIds} from '../../../../shared/artifact-canvas-pages'
import type { ArtifactDocument, ArtifactPage } from '../../../../shared/artifact-document'
import { applyOperations, prepareBatch, type ArtifactOperation, type ArtifactOperationBatch } from '../../../../shared/artifact-operations'

export interface NativeHistory { version: number; undo: string | null; redo: string | null }
export interface NativeCodeDraft {
  pageId:string;nodeIds:string[];text:string;before:Array<{name:string;value:string}>;base:ArtifactDocument
}
export interface NativeCodeDraftAccess {
  get(pageId:string,nodeIds:string[]):NativeCodeDraft|undefined
  retain(draft:NativeCodeDraft):void
  clear(pageId:string,nodeIds:string[]):void
  canCommit(pageId:string):boolean
}
export interface DocumentReceipt {
  document: ArtifactDocument
  history: NativeHistory
  write?: boolean
  seq?: number
  operationId?: string
  committedSeq?: number
  original?: unknown
  pageVersions?: Record<string, string>
  loadedPageIds?: string[]
  previews?: Record<string, ArtifactPage>
}
export interface NativeState {
  document: ArtifactDocument | null
  history: NativeHistory
  pending: number
  loading: boolean
  write: boolean
  error: string
  conflict: boolean
  original?: unknown
  loadedPageIds: string[]
  previews?: Record<string, ArtifactPage>
}
export interface NativeTransport {
  read(signal?: AbortSignal): Promise<DocumentReceipt>
  page(pageId: string, version: string, signal?: AbortSignal): Promise<{ page: ArtifactPage; version: string }>
  all(signal?: AbortSignal): Promise<DocumentReceipt>
  commit(batch: ArtifactOperationBatch, signal?: AbortSignal): Promise<DocumentReceipt>
  history(kind: 'undo' | 'redo', targetOperationId: string, expectedHistoryVersion: number, operationId: string): Promise<DocumentReceipt>
  changed(afterSeq: number, signal?: AbortSignal): Promise<boolean>
}

const statusOf = (error: unknown) => error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0

/** One acknowledged document and an ordered queue shared by every editor action.
 * Unknown network results are retried with the original operation ID. A conflict
 * keeps the unacknowledged operations intact; it never overwrites newer work. */
export class NativeDocumentSession {
  private state: NativeState = { document: null, history: { version: 0, undo: null, redo: null }, pending: 0, loading: true, write: false, error: '', conflict: false, loadedPageIds: [] }
  private committed: ArtifactDocument | null = null
  private queue: ArtifactOperationBatch[] = []
  private rejectedDrafts = new Map<string, ArtifactOperation[]>()
  private codeDrafts = new Map<string,NativeCodeDraft>()
  private predictions = new Map<string, Record<string, number>>()
  // Captured editing/gesture snapshots refer to anchors for our own optimistic
  // writes. ACKs may renumber those writes after an unrelated remote operation.
  // Weak keys let closed editors release their snapshots without a document log.
  private snapshotAnchors = new WeakMap<ArtifactDocument, Map<string, { version: number }>>()
  private batchAnchors = new Map<string, Map<string, { version: number }>>()
  private pageVersions: Record<string, string> = {}
  private loadingPages = new Map<string, Promise<void>>()
  private listeners = new Set<() => void>()
  private sending: Promise<void> | null = null
  private controller = new AbortController()
  private refreshGeneration = 0
  private disposed = false
  constructor(readonly transport: NativeTransport) {}
  getSnapshot = () => this.state
  getPageVersion = (pageId:string) => this.pageVersions[pageId]
  subscribe = (callback: () => void) => { this.listeners.add(callback); return () => this.listeners.delete(callback) }
  private update(patch: Partial<NativeState>) { if (this.disposed) return; this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener() }
  private accept(receipt: DocumentReceipt, acknowledged?: ArtifactOperationBatch) {
    if (this.committed && receipt.document.seq < this.committed.seq) return
    const loaded = new Set(receipt.loadedPageIds ?? artifactPageIds(receipt.document))
    const pages = { ...receipt.document.pages }
    for (const pageId of artifactPageIds(receipt.document)) {
      if (!loaded.has(pageId) && this.committed?.pages[pageId] && this.state.loadedPageIds.includes(pageId) && this.pageVersions[pageId] === receipt.pageVersions?.[pageId]) {
        pages[pageId] = this.committed.pages[pageId]
        loaded.add(pageId)
      }
    }
    this.pageVersions = receipt.pageVersions ?? {}
    this.committed = { ...receipt.document, pages }
    let document = this.committed
    try {
      if (acknowledged) this.rebaseUnsent(acknowledged, receipt.committedSeq ?? receipt.document.seq)
      for (const batch of this.queue) { const result = applyOperations(document, batch); this.rememberSnapshot(result.document, document, batch.operationId, result.changedKeys); document = result.document }
    }
    catch { this.update({ history: receipt.history, error: '同一内容已有新修改。本地修改已保留，请下载副本后重新载入。', conflict: true, loading: false, pending: this.queue.length }); return }
    this.update({ document, previews: receipt.previews ?? this.state.previews, history: receipt.history, write: receipt.write ?? this.state.write, original: receipt.original ?? this.state.original, loading: false, pending: this.queue.length, loadedPageIds: [...loaded] })
  }
  private rememberSnapshot(document: ArtifactDocument, parent: ArtifactDocument, operationId: string, keys: string[]) {
    const anchors = new Map(this.snapshotAnchors.get(parent))
    const batch = this.batchAnchors.get(operationId) ?? new Map<string, { version: number }>()
    for (const key of keys) { const anchor = batch.get(key) ?? { version: document.versions[key] }; batch.set(key, anchor); anchors.set(key, anchor) }
    this.batchAnchors.set(operationId, batch)
    this.snapshotAnchors.set(document, anchors)
  }
  private rebaseUnsent(acknowledged: ArtifactOperationBatch, committedSeq: number) {
    if (!this.committed) return
    const translations = new Map<string, Map<number, number>>()
    const remember = (key: string, before: number, after: number) => { const versions = translations.get(key) ?? new Map<number, number>(); versions.set(before, after); translations.set(key, versions) }
    for (const [key, predicted] of Object.entries(this.predictions.get(acknowledged.operationId) ?? {})) {
      const actual = this.committed.versions[key] ?? 0
      // Only our acknowledged write may translate a dependent precondition.
      // A later remote write retains its conflict, including after a lost ACK.
      if (actual === committedSeq) { remember(key, predicted, actual); const anchor = this.batchAnchors.get(acknowledged.operationId)?.get(key); if (anchor) anchor.version = actual }
    }
    this.batchAnchors.delete(acknowledged.operationId)
    this.predictions.delete(acknowledged.operationId)
    let working = this.committed
    for (let index = 0; index < this.queue.length; index++) {
      const previous = this.queue[index], expectedVersions = { ...previous.expectedVersions }
      let changed = false
      for (const [key, expected] of Object.entries(expectedVersions)) {
        const translated = translations.get(key)?.get(expected)
        if (translated !== undefined && translated !== expected) { expectedVersions[key] = translated; changed = true }
      }
      const batch = changed ? { ...previous, operationId: crypto.randomUUID(), baseSeq: working.seq, expectedVersions } : previous
      const result = applyOperations(working, batch)
      const anchors = this.batchAnchors.get(previous.operationId)
      if (anchors) { for (const key of result.changedKeys) { const anchor = anchors.get(key); if (anchor) anchor.version = result.document.versions[key] }; this.batchAnchors.delete(previous.operationId); this.batchAnchors.set(batch.operationId, anchors) }
      const prediction = this.predictions.get(previous.operationId) ?? {}
      for (const key of result.changedKeys) if (prediction[key] !== undefined) remember(key, prediction[key], result.document.versions[key])
      this.predictions.delete(previous.operationId)
      this.predictions.set(batch.operationId, Object.fromEntries(result.changedKeys.map(key => [key, result.document.versions[key]])))
      this.queue[index] = batch
      working = result.document
    }
  }
  async open() {
    const generation = ++this.refreshGeneration
    const unresolvedFailure=!!this.state.error&&(this.queue.length>0||this.rejectedDrafts.size>0)
    this.update({ loading: this.state.document === null, error: '' })
    try {
      const receipt = await this.transport.read(this.controller.signal)
      if (generation !== this.refreshGeneration || this.disposed) return
      this.update({ write: receipt.write !== false })
      this.accept(receipt)
      if(unresolvedFailure&&!this.state.conflict&&(this.queue.length||this.rejectedDrafts.size))this.update({error:'本地修改尚未保存，请重试保存，或下载本地副本。'})
    } catch (error) { if (!this.controller.signal.aborted) this.failure(error) }
  }
  async ensurePage(pageId: string) {
    if (this.state.loadedPageIds.includes(pageId) || !this.committed?.pages[pageId]) return
    const running = this.loadingPages.get(pageId)
    if (running) return running
    const version = this.pageVersions[pageId]
    if (!version) return
    const task = (async () => {
      try {
        const receipt = await this.transport.page(pageId, version, this.controller.signal)
        if (!this.committed || this.pageVersions[pageId] !== version || this.disposed) return
        this.committed = { ...this.committed, pages: { ...this.committed.pages, [pageId]: receipt.page } }
        let document = this.committed
        for (const batch of this.queue) { const result = applyOperations(document, batch); this.rememberSnapshot(result.document, document, batch.operationId, result.changedKeys); document = result.document }
        this.update({ document, loadedPageIds: [...new Set([...this.state.loadedPageIds, pageId])] })
      } catch (error) { if (!this.controller.signal.aborted) this.failure(error) }
      finally { this.loadingPages.delete(pageId) }
    })()
    this.loadingPages.set(pageId, task)
    return task
  }
  async exportSnapshot(signal?: AbortSignal) { await this.flush(); return this.transport.all(signal) }
  async refresh() {
    if (!this.committed || this.sending || this.state.conflict) return
    try {
      if (await this.transport.changed(this.committed.seq, this.controller.signal)) await this.open()
    } catch (error) { if (!this.controller.signal.aborted && [401, 403, 404, 410].includes(statusOf(error))) this.failure(error) }
  }
  dispatch(operations: ArtifactOperation[], baseDocument?: ArtifactDocument, readKeys:readonly string[]=[] ) {
    if (!operations.length || !this.state.document || !this.state.write) return
    if (this.state.conflict) {
      const key = operations.map(operation => `${operation.type}:${'pageId' in operation ? operation.pageId : ''}:${'nodeId' in operation ? operation.nodeId : ''}`).join('|')
      this.rejectedDrafts.set(key, structuredClone(operations))
      this.update({ pending: this.queue.length + this.rejectedDrafts.size })
      return
    }
    const batch = prepareBatch(baseDocument ?? this.state.document, operations)
    for(const key of readKeys)batch.expectedVersions[key]=(baseDocument??this.state.document).versions[key]??0
    if (baseDocument) for (const [key, anchor] of this.snapshotAnchors.get(baseDocument) ?? []) {
      if (key in batch.expectedVersions) batch.expectedVersions[key] = anchor.version
    }
    let result
    try { result = applyOperations(this.state.document, batch) }
    catch (error) {
      this.queue.push(batch)
      this.update({ conflict: true, pending: this.queue.length, error: '同一内容已有新修改。本地修改已保留，请下载副本后重新载入。' })
      throw error
    }
    this.queue.push(batch)
    this.rememberSnapshot(result.document, this.state.document, batch.operationId, result.changedKeys)
    this.predictions.set(batch.operationId, Object.fromEntries(result.changedKeys.map(key => [key, result.document.versions[key]])))
    this.update({ document: result.document, pending: this.queue.length, error: '', loadedPageIds: [...new Set([...this.state.loadedPageIds, ...operations.flatMap(operation => operation.type === 'page.insert' ? [operation.page.id] : [])])] })
    void this.pump()
  }
  private failure(error: unknown) {
    const status = statusOf(error)
    if ([401, 403, 404, 410].includes(status)) this.update({ document: null, write: false, loading: false, error: '当前无法访问此稿件，请检查权限。' })
    else if (status === 422) this.update({ loading: false, write: false, error: '此稿件格式暂不支持，可下载原始文件。' })
    else this.update({ loading: false, conflict: status === 409, error: status === 409 ? '同一内容已有新修改。本地修改已保留，请下载副本后重新载入。' : '修改尚未保存。请检查网络后重试。' })
  }
  private pump(): Promise<void> {
    if (this.sending) return this.sending
    if (!this.queue.length || this.state.conflict || this.disposed) return Promise.resolve()
    this.sending = (async () => {
      while (this.queue.length && !this.disposed && !this.state.conflict) {
        const batch = this.queue[0]
        try {
          const receipt = await this.transport.commit(batch, this.controller.signal)
          if (this.disposed) return
          this.queue.shift()
          this.accept(receipt, batch)
          if (!this.state.conflict) this.update({ error: '', pending: this.queue.length })
        } catch (error) { if (!this.controller.signal.aborted) this.failure(error); break }
      }
    })().finally(() => { this.sending = null })
    return this.sending
  }
  async flush() { await this.pump(); if (this.queue.length || this.rejectedDrafts.size || this.codeDrafts.size || this.state.conflict) throw new Error('稿件还有未保存的修改。') }
  async retry() { if (!this.state.conflict) { this.update({ error: '' }); await this.pump(); if (!this.state.document) await this.open() } }
  async undoRedo(kind: 'undo' | 'redo') {
    try {
      await this.flush()
      await this.open()
      const target = this.state.history[kind]
      if (!target || !this.state.write) return
      this.accept(await this.transport.history(kind, target, this.state.history.version, crypto.randomUUID()))
    } catch (error) { this.failure(error) }
  }
  get hasRetainedDrafts(){return this.rejectedDrafts.size>0||this.codeDrafts.size>0}
  private codeDraftKey(pageId:string,nodeIds:string[]){return pageId+'|'+[...nodeIds].sort().join(',')}
  getCodeDraft(pageId:string,nodeIds:string[]){return this.codeDrafts.get(this.codeDraftKey(pageId,nodeIds))}
  retainCodeDraft(draft:NativeCodeDraft){
    this.codeDrafts.set(this.codeDraftKey(draft.pageId,draft.nodeIds),{...draft,nodeIds:[...draft.nodeIds],before:draft.before.map(entry=>({...entry}))})
    this.update({pending:this.queue.length+this.rejectedDrafts.size+this.codeDrafts.size,error:this.state.error||(this.state.write&&this.state.document&&!this.state.conflict?'':'当前无法保存，本地修改已保留。可下载本地副本。')})
  }
  clearCodeDraft(pageId:string,nodeIds:string[]){if(this.codeDrafts.delete(this.codeDraftKey(pageId,nodeIds)))this.update({pending:this.queue.length+this.rejectedDrafts.size+this.codeDrafts.size,...(!this.hasRetainedDrafts&&!this.queue.length&&this.state.error==='当前无法保存，本地修改已保留。可下载本地副本。'?{error:''}:{})})}
  /** Preserve an already edited control after access changes; never send it automatically. */
  retainDraft(operations:ArtifactOperation[]){
    if(!operations.length)return
    const key='retained:'+operations.map(operation=>`${operation.type}:${'pageId' in operation?operation.pageId:''}:${'nodeId' in operation?operation.nodeId:''}`).join('|')
    this.rejectedDrafts.set(key,structuredClone(operations))
    this.update({pending:this.queue.length+this.rejectedDrafts.size+this.codeDrafts.size,error:'当前无法保存，本地修改已保留。可下载本地副本。'})
  }
  recovery() { return { format: 'lingxi-native-recovery-v1', document: this.state.document, operations: this.queue, drafts: [...this.rejectedDrafts.values()],codeDrafts:[...this.codeDrafts.values()] } }
  async discardAfterRecovery() { if (this.sending) await this.sending; this.queue = []; this.predictions.clear(); this.batchAnchors.clear(); this.snapshotAnchors = new WeakMap(); this.rejectedDrafts.clear();this.codeDrafts.clear(); this.update({ conflict: false, error: '', pending: 0 }); await this.open() }
  dispose() { this.disposed = true; this.controller.abort(); this.listeners.clear() }
}
