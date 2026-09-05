/**
 * In-process Y.Doc room manager.
 *
 * One Y.Doc per opened document is held in memory while at least one
 * local subscriber (a WS client or an agent loop) is attached. When the
 * last subscriber detaches we keep the room around for a short grace
 * window so a refresh / quick re-open doesn't pay the cold-load cost.
 *
 * Persistence is append-only: every Y.Doc 'update' event is written to
 * `document_updates`. A periodic compaction merges the log into a single
 * `document_snapshots` row; the next cold load reads the snapshot + any
 * tail updates. The room manager subscribes to a Redis channel so two
 * different server instances can fan an update out to each other and
 * stay convergent — Yjs updates are CRDTs, applying the same update
 * twice is a no-op.
 */
import * as Y from 'yjs'
import type { Queryable } from '../../db/queryable.js'
import type {
  AgentDocumentEditOperation,
  AgentDocumentEditResult,
  AgentImagePlacement,
  DocumentAwarenessEvent,
  DocumentUpdateEvent,
} from './contracts.js'
import {
  markdownToYXml,
  parseMarkdownImageBlock,
  proseMirrorNodeToYXml,
  type ProseMirrorJsonNode,
} from './markdown.js'
import {
  compactDocumentUpdates,
  loadDocumentSnapshot,
  loadDocumentUpdatesAfter,
  lockTenantDocument,
  persistDocumentUpdate,
} from './collaboration-repository.js'

/** A subscriber attached to a room. Updates emitted by the local Y.Doc
 *  are pushed to every subscriber except the one whose `originId`
 *  matches — that's the originator's own echo. */
export interface DocSubscriber {
  originId: string
  /** Called for every Yjs update applied to the room — local or remote. */
  onUpdate: (update: Uint8Array, originId: string) => void
  /** Called for every awareness update (cursors etc.) — never persisted. */
  onAwareness: (update: Uint8Array, originId: string) => void
}

interface Room {
  documentId: string
  companyId: string
  doc: Y.Doc
  subs: Set<DocSubscriber>
  /** Updates since last snapshot — drives the compaction threshold. */
  updatesSinceSnapshot: number
  /** Set during cold-load to coalesce concurrent waiters. */
  loaded: Promise<void>
  /** Serializes persistence, Redis publication, and compaction. Mutating
   *  APIs await this promise so an infrastructure failure rejects the
   *  originating request instead of being hidden. */
  pendingEffects: Promise<void>
  /** Marked true after the doc is hydrated from DB; flips OFF doc.on('update')
   *  persistence to skip writing replays back into the log. */
  hydrated: boolean
}

const COMPACT_AFTER_UPDATES = 200
const ROOM_GRACE_MS = 60_000

export interface DocumentCollaborationBus {
  publish(event: DocumentUpdateEvent | DocumentAwarenessEvent): Promise<void>
  subscribe(listener: (event: DocumentUpdateEvent | DocumentAwarenessEvent) => void): Promise<void>
}

export interface DocumentImageStorage {
  normalizeKey(value: string | null | undefined): string | null
  keyFromPublicUrl(url: string | null | undefined): string | null
  signedUrlExpiresSoon(url: string, withinSeconds?: number): boolean
  publicUrl(key: string): Promise<string>
}

export interface DocumentCollaborationDependencies {
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  bus: DocumentCollaborationBus
  imageStorage: DocumentImageStorage
  instanceId: string
}

class DocumentRoomRuntime {
  private readonly rooms = new Map<string, Room>()
  private readonly evictions = new Map<string, NodeJS.Timeout>()
  private readonly origin: string
  private busBootstrapped = false

  constructor(private readonly dependencies: DocumentCollaborationDependencies) {
    this.origin = `instance:${dependencies.instanceId}`
  }

  instanceOrigin(): string { return this.origin }

  private async maybeCompact(room: Room): Promise<void> {
    if (room.updatesSinceSnapshot < COMPACT_AFTER_UPDATES) return
    await this.dependencies.transaction(async (db) => {
      await lockTenantDocument(db, room.documentId, room.companyId)
      const snapshot = await loadDocumentSnapshot(db, room.documentId, room.companyId)
      const tail = await loadDocumentUpdatesAfter(db, room.documentId, room.companyId, snapshot.lastIncluded)
      const authoritative = new Y.Doc()
      if (snapshot.state) Y.applyUpdate(authoritative, snapshot.state, 'hydrate')
      for (const update of tail) Y.applyUpdate(authoritative, update.bytes, 'hydrate')
      await compactDocumentUpdates(
        db,
        room.documentId,
        room.companyId,
        Y.encodeStateAsUpdate(authoritative),
      )
    })
    room.updatesSinceSnapshot = 0
  }

  private async hydrateDoc(documentId: string, companyId: string, doc: Y.Doc): Promise<void> {
    const { snapshot, tail } = await this.dependencies.transaction(async (db) => {
      await lockTenantDocument(db, documentId, companyId)
      const snapshot = await loadDocumentSnapshot(db, documentId, companyId)
      const tail = await loadDocumentUpdatesAfter(db, documentId, companyId, snapshot.lastIncluded)
      return { snapshot, tail }
    })
    if (snapshot.state) Y.applyUpdate(doc, snapshot.state, 'hydrate')
    for (const update of tail) Y.applyUpdate(doc, update.bytes, 'hydrate')
  }

  async getOrCreateRoom(documentId: string, companyId: string): Promise<Room> {
    const pending = this.evictions.get(documentId)
    if (pending) { clearTimeout(pending); this.evictions.delete(documentId) }

    const existing = this.rooms.get(documentId)
    if (existing) {
      await existing.loaded
      if (existing.companyId !== companyId) throw new Error('document room tenant mismatch')
      return existing
    }

    const doc = new Y.Doc()
    const room: Room = {
      documentId,
      companyId,
      doc,
      subs: new Set(),
      updatesSinceSnapshot: 0,
      hydrated: false,
      loaded: Promise.resolve(),
      pendingEffects: Promise.resolve(),
    }
    this.rooms.set(documentId, room)

    room.loaded = (async () => {
      await this.hydrateDoc(documentId, companyId, doc)
      room.hydrated = true
      doc.on('update', (update: Uint8Array, updateOrigin: unknown) => {
        if (updateOrigin === 'hydrate') return
        const isRemote = typeof updateOrigin === 'object' && updateOrigin !== null && 'remote' in updateOrigin
        const originId = (() => {
          if (typeof updateOrigin === 'string') return updateOrigin
          if (isRemote) return (updateOrigin as { remote: string }).remote
          if (typeof updateOrigin === 'object' && updateOrigin !== null && 'originId' in updateOrigin) {
            return String((updateOrigin as { originId: string }).originId)
          }
          return this.origin
        })()
        const authorId = typeof updateOrigin === 'object' && updateOrigin !== null && 'authorId' in updateOrigin
          ? String((updateOrigin as { authorId: string }).authorId)
          : originId

        for (const subscriber of room.subs) {
          if (subscriber.originId !== originId) subscriber.onUpdate(update, originId)
        }
        if (!isRemote) {
          room.updatesSinceSnapshot += 1
          room.pendingEffects = room.pendingEffects.then(async () => {
            await this.dependencies.transaction(async (db) => {
              await lockTenantDocument(db, documentId, room.companyId)
              await persistDocumentUpdate(db, {
                documentId, companyId: room.companyId, authorId, bytes: update,
              })
            })
            await this.dependencies.bus.publish({
              type: 'doc.update',
              companyId: room.companyId,
              documentId,
              updateB64: Buffer.from(update).toString('base64'),
              originId,
              authorId,
            })
            await this.maybeCompact(room)
          })
        }
      })
      normalizeMarkdownImageParagraphs(doc, pmFragment(doc), {
        originId: 'system:doc-image-normalize', authorId: 'system',
      })
      await refreshDocumentImageUrls(this.dependencies.imageStorage, doc, pmFragment(doc), {
        originId: 'system:doc-image-refresh', authorId: 'system',
      })
      await room.pendingEffects
    })()

    try {
      await room.loaded
      return room
    } catch (error) {
      if (this.rooms.get(documentId) === room) this.rooms.delete(documentId)
      throw error
    }
  }

  async subscribe(documentId: string, companyId: string, subscriber: DocSubscriber): Promise<{ initialState: Uint8Array }> {
    const room = await this.getOrCreateRoom(documentId, companyId)
    await refreshDocumentImageUrls(this.dependencies.imageStorage, room.doc, pmFragment(room.doc), {
      originId: 'system:doc-image-refresh', authorId: 'system',
    })
    room.subs.add(subscriber)
    return { initialState: Y.encodeStateAsUpdate(room.doc) }
  }

  unsubscribe(documentId: string, subscriber: DocSubscriber): void {
    const room = this.rooms.get(documentId)
    if (!room) return
    room.subs.delete(subscriber)
    if (room.subs.size !== 0) return
    const timer = setTimeout(() => {
      if ((this.rooms.get(documentId)?.subs.size ?? 0) === 0) {
        this.rooms.delete(documentId)
        this.evictions.delete(documentId)
      }
    }, ROOM_GRACE_MS)
    timer.unref()
    this.evictions.set(documentId, timer)
  }

  async applyLocalUpdate(
    documentId: string,
    companyId: string,
    originId: string,
    authorId: string,
    update: Uint8Array,
  ): Promise<void> {
    const room = await this.getOrCreateRoom(documentId, companyId)
    Y.applyUpdate(room.doc, update, { originId, authorId } as never)
    await room.pendingEffects
  }

  private applyRemoteUpdate(
    documentId: string,
    companyId: string,
    originId: string,
    update: Uint8Array,
  ): void {
    const room = this.rooms.get(documentId)
    if (room?.hydrated && room.companyId === companyId) {
      Y.applyUpdate(room.doc, update, { remote: originId } as never)
    }
  }

  async broadcastAwareness(
    documentId: string,
    companyId: string,
    originId: string,
    update: Uint8Array,
  ): Promise<void> {
    const room = this.rooms.get(documentId)
    if (room) {
      for (const subscriber of room.subs) {
        if (subscriber.originId !== originId) subscriber.onAwareness(update, originId)
      }
    }
    await this.dependencies.bus.publish({
      type: 'doc.awareness', companyId, documentId,
      updateB64: Buffer.from(update).toString('base64'), originId,
    })
  }

  async boot(): Promise<void> {
    if (this.busBootstrapped) return
    this.busBootstrapped = true
    try {
      await this.dependencies.bus.subscribe((event) => {
        if (event.originId === this.origin) return
        const bytes = Buffer.from(event.updateB64, 'base64')
        const update = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        if (event.type === 'doc.update') {
          this.applyRemoteUpdate(event.documentId, event.companyId, event.originId, update)
          return
        }
        const room = this.rooms.get(event.documentId)
        if (!room || room.companyId !== event.companyId) return
        for (const subscriber of room.subs) {
          if (subscriber.originId !== event.originId) subscriber.onAwareness(update, event.originId)
        }
      })
    } catch (error) {
      this.busBootstrapped = false
      throw error
    }
  }
}

/* ============== ProseMirror-aware helpers ==============
 *
 * The editor binds TipTap's Collaboration extension to the default Yjs
 * XmlFragment (key = 'default'). Agent reads + edits go through the
 * same fragment so what the human sees IS what the agent sees — no
 * out-of-band "second body" to keep in sync. */
const PM_FRAGMENT_KEY = 'default'

function pmFragment(doc: Y.Doc): Y.XmlFragment {
  return doc.getXmlFragment(PM_FRAGMENT_KEY)
}

type ImageNormalizeOrigin = { originId: string; authorId: string }

function imageElementFromNode(node: ProseMirrorJsonNode): Y.XmlElement | null {
  const yNode = proseMirrorNodeToYXml(node)
  return yNode instanceof Y.XmlElement ? yNode : null
}

function hrefFromDeltaAttributes(attrs: unknown): string | null {
  if (!attrs || typeof attrs !== 'object') return null
  const link = (attrs as { link?: unknown }).link
  if (!link || typeof link !== 'object') return null
  const href = (link as { href?: unknown }).href
  return typeof href === 'string' && href ? href : null
}

function paragraphTextSegments(el: Y.XmlElement): Array<{ text: string; href: string | null }> | null {
  const segments: Array<{ text: string; href: string | null }> = []
  for (let i = 0; i < el.length; i++) {
    const child = el.get(i) as Y.AbstractType<unknown>
    if (!(child instanceof Y.XmlText)) return null
    const delta = child.toDelta() as Array<{ insert?: unknown; attributes?: unknown }>
    for (const op of delta) {
      if (typeof op.insert !== 'string') return null
      segments.push({ text: op.insert, href: hrefFromDeltaAttributes(op.attributes) })
    }
  }
  return segments
}

function linkedImageParagraphNode(el: Y.XmlElement): ProseMirrorJsonNode | null {
  const segments = paragraphTextSegments(el)
  if (!segments || segments.length === 0) return null

  const chars: Array<{ ch: string; href: string | null }> = []
  for (const segment of segments) {
    for (const ch of segment.text) chars.push({ ch, href: segment.href })
  }

  let start = 0
  let end = chars.length - 1
  while (start <= end && !chars[start].ch.trim()) start++
  while (end >= start && !chars[end].ch.trim()) end--
  if (start > end || chars[start].ch !== '!' || chars[start].href) return null

  const firstLinked = chars[start + 1]
  if (!firstLinked?.href) return null
  const href = firstLinked.href
  let alt = ''
  for (let i = start + 1; i <= end; i++) {
    if (chars[i].href !== href) return null
    alt += chars[i].ch
  }
  if (!alt.trim()) return null
  return { type: 'image', attrs: { src: href, alt: alt.trim(), title: null } }
}

function paragraphImageNode(el: Y.XmlElement): ProseMirrorJsonNode | null {
  return parseMarkdownImageBlock(inlineText(el).trim()) ?? linkedImageParagraphNode(el)
}

function normalizeMarkdownImageParagraphChildren(parent: Y.XmlFragment | Y.XmlElement): number {
  let changed = 0
  for (let i = parent.length - 1; i >= 0; i--) {
    const child = parent.get(i) as Y.AbstractType<unknown>
    if (!(child instanceof Y.XmlElement)) continue

    const replacement = child.nodeName === 'paragraph' ? paragraphImageNode(child) : null
    if (replacement) {
      const yImage = imageElementFromNode(replacement)
      if (yImage) {
        parent.delete(i, 1)
        parent.insert(i, [yImage])
        changed++
      }
      continue
    }

    changed += normalizeMarkdownImageParagraphChildren(child)
  }
  return changed
}

function normalizeMarkdownImageParagraphs(
  doc: Y.Doc,
  fragment: Y.XmlFragment,
  origin: ImageNormalizeOrigin,
): number {
  let changed = 0
  doc.transact(() => {
    changed = normalizeMarkdownImageParagraphChildren(fragment)
  }, origin as never)
  return changed
}

function imageStorageKey(imageStorage: DocumentImageStorage, el: Y.XmlElement): string | null {
  return imageStorage.normalizeKey(xmlAttrString(el, 'storageKey'))
}

function shouldRefreshDocumentImageUrl(imageStorage: DocumentImageStorage, src: string, key: string): boolean {
  if (!src) return true
  const srcKey = imageStorage.keyFromPublicUrl(src)
  if (!srcKey) return true
  if (srcKey !== key) return true
  if (!src.includes('exp=') && !src.includes('sig=')) return key.startsWith('attachments/')
  return imageStorage.signedUrlExpiresSoon(src)
}

function collectImageElements(parent: Y.XmlFragment | Y.XmlElement, out: Y.XmlElement[]): void {
  for (let i = 0; i < parent.length; i++) {
    const child = parent.get(i) as Y.AbstractType<unknown>
    if (!(child instanceof Y.XmlElement)) continue
    if (child.nodeName === 'image') out.push(child)
    collectImageElements(child, out)
  }
}

async function refreshDocumentImageUrls(
  imageStorage: DocumentImageStorage,
  doc: Y.Doc,
  fragment: Y.XmlFragment,
  origin: ImageNormalizeOrigin,
): Promise<number> {
  const images: Y.XmlElement[] = []
  collectImageElements(fragment, images)
  const updates: Array<{ el: Y.XmlElement; key: string; url: string | null }> = []
  for (const el of images) {
    const src = xmlAttrString(el, 'src')
    const currentKey = imageStorage.normalizeKey(xmlAttrString(el, 'storageKey'))
    const key = currentKey ?? imageStorageKey(imageStorage, el)
    if (!key) continue
    const shouldRefresh = shouldRefreshDocumentImageUrl(imageStorage, src, key)
    const url = shouldRefresh ? await imageStorage.publicUrl(key) : null
    if (!currentKey || (url && url !== src)) updates.push({ el, key, url })
  }
  if (updates.length === 0) return 0
  doc.transact(() => {
    for (const update of updates) {
      update.el.setAttribute('storageKey', update.key)
      if (update.url) update.el.setAttribute('src', update.url)
    }
  }, origin as never)
  return updates.length
}

/** Walk a ProseMirror Y.XmlFragment depth-first, yielding every Y.XmlText
 *  leaf. Used for plain-text extraction and find-and-replace edits. */
function* iterXmlText(parent: Y.XmlFragment | Y.XmlElement): Generator<Y.XmlText> {
  const len = parent.length
  for (let i = 0; i < len; i++) {
    const child = parent.get(i) as Y.AbstractType<unknown>
    if (child instanceof Y.XmlText) {
      yield child
    } else if (child instanceof Y.XmlElement) {
      yield* iterXmlText(child)
    }
  }
}

/** Render the doc's ProseMirror content as plain text. Block elements
 *  (paragraph, heading, listItem…) are separated by a single newline so
 *  the result reads naturally without HTML markup. */
function inlineText(parent: Y.XmlFragment | Y.XmlElement): string {
  const buf: string[] = []
  for (const t of iterXmlText(parent)) buf.push(t.toString())
  return buf.join('')
}

function xmlAttrNumber(el: Y.XmlElement, key: string, defaultValue: number): number {
  const value = el.getAttribute(key)
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : defaultValue
}

function xmlAttrString(el: Y.XmlElement, key: string): string {
  const value = el.getAttribute(key)
  return typeof value === 'string' ? value : ''
}

function escapeMarkdownImageText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/]/g, '\\]')
}

function imageToMarkdown(el: Y.XmlElement): string {
  const src = xmlAttrString(el, 'src')
  const alt = escapeMarkdownImageText(xmlAttrString(el, 'alt'))
  const title = xmlAttrString(el, 'title').replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  if (!src) return alt || '[image]'
  return `![${alt}](${src}${title ? ` "${title}"` : ''})`
}

function elementToPlainLines(el: Y.XmlElement): string[] {
  switch (el.nodeName) {
    case 'paragraph':
      return [inlineText(el)]
    case 'heading':
      return [`${'#'.repeat(Math.max(1, Math.min(6, xmlAttrNumber(el, 'level', 1))))} ${inlineText(el)}`]
    case 'codeBlock': {
      const language = String(el.getAttribute('language') ?? '')
      return [`\`\`\`${language}`, inlineText(el), '```']
    }
    case 'blockquote':
      return elementChildrenToPlainLines(el).map((line) => line ? `> ${line}` : '>')
    case 'bulletList':
      return listToPlainLines(el, '-')
    case 'orderedList':
      return listToPlainLines(el, `${xmlAttrNumber(el, 'start', 1)}.`)
    case 'listItem':
      return elementChildrenToPlainLines(el)
    case 'horizontalRule':
      return ['---']
    case 'image':
      return [imageToMarkdown(el)]
    case 'table':
      return tableToPlainLines(el)
    default: {
      const childLines = elementChildrenToPlainLines(el)
      return childLines.length > 0 ? childLines : [inlineText(el)]
    }
  }
}

/** Serialize a ProseMirror table back to GFM so agents reading the doc
 *  (readDocumentText) see the same `| a | b |` markdown they authored,
 *  instead of one flattened line per cell. Pipes inside cells are escaped. */
function tableToPlainLines(table: Y.XmlElement): string[] {
  const lines: string[] = []
  for (let i = 0; i < table.length; i++) {
    const row = table.get(i) as Y.AbstractType<unknown>
    if (!(row instanceof Y.XmlElement) || row.nodeName !== 'tableRow') continue
    const cells: string[] = []
    for (let j = 0; j < row.length; j++) {
      const cell = row.get(j) as Y.AbstractType<unknown>
      if (!(cell instanceof Y.XmlElement)) continue
      cells.push(elementChildrenToPlainLines(cell).join(' ').replace(/\|/g, '\\|'))
    }
    lines.push(`| ${cells.join(' | ')} |`)
    if (lines.length === 1) lines.push(`|${' --- |'.repeat(cells.length)}`)
  }
  return lines
}

function elementChildrenToPlainLines(parent: Y.XmlElement): string[] {
  const lines: string[] = []
  for (let i = 0; i < parent.length; i++) {
    const child = parent.get(i) as Y.AbstractType<unknown>
    if (child instanceof Y.XmlElement) lines.push(...elementToPlainLines(child))
    else if (child instanceof Y.XmlText) lines.push(child.toString())
  }
  return lines
}

function listToPlainLines(list: Y.XmlElement, marker: string): string[] {
  const lines: string[] = []
  let index = marker.endsWith('.') ? Number.parseInt(marker, 10) || 1 : 0
  for (let i = 0; i < list.length; i++) {
    const child = list.get(i) as Y.AbstractType<unknown>
    if (!(child instanceof Y.XmlElement)) continue
    const itemLines = elementToPlainLines(child)
    const itemMarker = marker.endsWith('.') ? `${index++}.` : marker
    if (itemLines.length === 0) {
      lines.push(itemMarker)
      continue
    }
    lines.push(`${itemMarker} ${itemLines[0]}`)
    for (const line of itemLines.slice(1)) lines.push(`  ${line}`)
  }
  return lines
}

function fragmentToPlainText(fragment: Y.XmlFragment): string {
  const lines: string[] = []
  const len = fragment.length
  for (let i = 0; i < len; i++) {
    const child = fragment.get(i) as Y.AbstractType<unknown>
    if (child instanceof Y.XmlElement) {
      lines.push(...elementToPlainLines(child))
    } else if (child instanceof Y.XmlText) {
      lines.push(child.toString())
    }
  }
  return lines.join('\n')
}

/** Read-only access to the doc's current plain-text body. Used by REST
 *  bootstrap responses + agent tools that don't want to hold a WS
 *  session. Extracted by walking the ProseMirror fragment. */
async function readDocumentText(
  runtime: DocumentRoomRuntime,
  imageStorage: DocumentImageStorage,
  documentId: string,
  companyId: string,
): Promise<string> {
  const room = await runtime.getOrCreateRoom(documentId, companyId)
  await refreshDocumentImageUrls(imageStorage, room.doc, pmFragment(room.doc), {
    originId: 'system:doc-image-refresh', authorId: 'system',
  })
  return fragmentToPlainText(pmFragment(room.doc))
}

/** Append agent-authored prose to the document as native ProseMirror nodes.
 *  Agents naturally write markdown, while the human editor stores rich
 *  TipTap/Yjs structure. Convert at the insertion boundary so collaborators
 *  see headings, lists, quotes, code blocks, and inline marks instead of raw
 *  markdown punctuation. */
function insertAgentMarkdown(fragment: Y.XmlFragment, text: string, index?: number): void {
  const nodes = markdownToYXml(text)
  if (index === undefined) {
    fragment.push(nodes)
  } else {
    fragment.insert(index, nodes)
  }
}

/** Edit primitive for agents: ProseMirror-aware so the human's editor
 *  sees the change as a structured update rather than a raw byte
 *  rewrite. Three op kinds:
 *
 *   - `append`: markdown-authored blocks at the end of the doc.
 *   - `replace`: first occurrence of `find` → `replace` (text content
 *     only — marks on the matched range survive untouched).
 *   - `insertParagraph`: markdown-authored blocks prepended (index 0) or at the
 *     end depending on `at`.
 *
 *  Wrapped in a single Yjs transaction so observers see one update. */
/** Placement spec for the `image` agent op.
 *
 *  Two modes:
 *   - absolute: insert at the start or end of the document
 *   - anchored: find a block (paragraph / heading / list item) whose text
 *     contains `anchorText` and place the image relative to it
 *
 *  `replace` is the killer: agents can swap a previously-emitted but
 *  inert `![alt](url)` markdown paragraph for a real image node by
 *  passing the exact markdown text as the anchor. */
/** Explicit type guard for the anchored half of {@link AgentImagePlacement}.
 *  Some TS versions (including the one CI runs) don't narrow
 *  `placement.anchorText` after `mode === 'start' / 'end'` checks even
 *  though discriminated-union rules say they should. A user-defined
 *  predicate sidesteps the issue. */
export function isAnchoredImagePlacement(
  p: AgentImagePlacement,
): p is { mode: 'replace' | 'after' | 'before'; anchorText: string } {
  return p.mode === 'replace' || p.mode === 'after' || p.mode === 'before'
}

/** Walk the fragment top-to-bottom, return (index, element) of the first
 *  XmlElement whose flattened text content contains `needle`. Returns
 *  null when no block matches. */
function findFirstBlockContaining(
  fragment: Y.XmlFragment,
  needle: string,
): { index: number; element: Y.XmlElement } | null {
  for (let i = 0; i < fragment.length; i++) {
    const child = fragment.get(i) as Y.AbstractType<unknown>
    if (!(child instanceof Y.XmlElement)) continue
    if (inlineText(child).includes(needle)) return { index: i, element: child }
  }
  return null
}

/** Match spec for the image-delete agent op. */
/** Find every image element under `parent` (recursively) and return their
 *  (parent-index, element) pairs. Used by the image-delete op to locate
 *  matches without mutating mid-traversal. */
function collectImageBlocks(
  parent: Y.XmlFragment | Y.XmlElement,
): Array<{ container: Y.XmlFragment | Y.XmlElement; index: number; element: Y.XmlElement }> {
  const out: Array<{ container: Y.XmlFragment | Y.XmlElement; index: number; element: Y.XmlElement }> = []
  for (let i = 0; i < parent.length; i++) {
    const child = parent.get(i) as Y.AbstractType<unknown>
    if (!(child instanceof Y.XmlElement)) continue
    if (child.nodeName === 'image') out.push({ container: parent, index: i, element: child })
    else out.push(...collectImageBlocks(child))
  }
  return out
}

async function applyAgentEdit(
  runtime: DocumentRoomRuntime,
  documentId: string,
  companyId: string,
  agentId: string,
  ops: AgentDocumentEditOperation[],
): Promise<AgentDocumentEditResult> {
  const room = await runtime.getOrCreateRoom(documentId, companyId)
  const fragment = pmFragment(room.doc)
  let replaced = 0
  let imagePlaced: 'absolute' | 'anchor' | 'anchor-missed' | null = null
  let imagesDeleted = 0
  let blocksReplaced = 0
  const origin = { originId: `agent:${agentId}`, authorId: agentId } as never
  room.doc.transact(() => {
    for (const op of ops) {
      if (op.kind === 'append') {
        insertAgentMarkdown(fragment, op.text)
      } else if (op.kind === 'insertParagraph') {
        if (op.at === 'end') {
          insertAgentMarkdown(fragment, op.text)
        } else {
          insertAgentMarkdown(fragment, op.text, 0)
        }
      } else if (op.kind === 'replaceBlock') {
        // Structural swap: replace ONE whole block (the first containing
        // anchorText) with freshly-parsed markdown blocks. This is what
        // `replace` can't do — that op only edits text inside a block, so
        // e.g. a flattened markdown table stuck in a paragraph could never
        // be turned back into a real table without this. Anchor miss is a
        // no-op (mirrors the image-replace rule: never append on a miss).
        const hit = findFirstBlockContaining(fragment, op.anchorText)
        if (hit) {
          fragment.delete(hit.index, 1)
          insertAgentMarkdown(fragment, op.text, hit.index)
          blocksReplaced++
        }
      } else if (op.kind === 'image') {
        // Direct image-block insert — bypasses the markdown parser
        // entirely so agents get a deterministic insert regardless of
        // how their model formatter wrapped the URL. Same Y.XmlElement
        // shape the markdown image branch emits, so the human's editor
        // doesn't care which path produced it.
        const yImage = imageElementFromNode({
          type: 'image',
          attrs: { src: op.src, alt: op.alt, title: null },
        })
        if (!yImage) continue
        const p = op.placement
        if (isAnchoredImagePlacement(p)) {
          const hit = findFirstBlockContaining(fragment, p.anchorText)
          if (!hit) {
            // Anchor not found — do not append at the end. Doing so
            // would mean every `--replace` miss silently re-appends a
            // duplicate image, which is how the doc collected the mess
            // it has now. Skip the op and let the CLI return an error
            // so the agent retries with a different snippet or fixes
            // the doc by hand.
            imagePlaced = 'anchor-missed'
          } else if (p.mode === 'replace') {
            fragment.delete(hit.index, 1)
            fragment.insert(hit.index, [yImage])
            imagePlaced = 'anchor'
          } else if (p.mode === 'after') {
            fragment.insert(hit.index + 1, [yImage])
            imagePlaced = 'anchor'
          } else /* before */ {
            fragment.insert(hit.index, [yImage])
            imagePlaced = 'anchor'
          }
        } else {
          // Absolute placement (start / end).
          if (p.mode === 'start') fragment.insert(0, [yImage])
          else fragment.push([yImage])
          imagePlaced = 'absolute'
        }
      } else if (op.kind === 'imageDelete') {
        // Walk every image node in the fragment and delete those whose
        // src / alt matches the supplied criterion. Iterate from end →
        // start to keep indices stable as we splice. Collected via
        // collectImageBlocks above (which recurses through container
        // blocks like blockquote / list) so we can also reach nested
        // illustrations.
        const all = collectImageBlocks(fragment)
        const matches = all.filter(({ element }) => {
          const src = xmlAttrString(element, 'src')
          const alt = xmlAttrString(element, 'alt')
          if (op.match.by === 'src') return src === op.match.src
          if (op.match.by === 'src-contains') return src.includes(op.match.substring)
          /* by alt */ return alt === op.match.alt
        })
        // Sort descending by index so we can delete in place without
        // shifting earlier indices. Group by container (rare for nested
        // images but possible).
        matches.sort((a, b) => b.index - a.index)
        for (const m of matches) {
          m.container.delete(m.index, 1)
          imagesDeleted++
        }
      } else if (op.kind === 'replace') {
        for (const t of iterXmlText(fragment)) {
          const s = t.toString()
          const idx = s.indexOf(op.find)
          if (idx >= 0) {
            t.delete(idx, op.find.length)
            if (op.replace.length > 0) t.insert(idx, op.replace)
            replaced++
            break
          }
        }
      }
    }
    normalizeMarkdownImageParagraphChildren(fragment)
  }, origin)
  await room.pendingEffects
  return { replaced, imagePlaced, imagesDeleted, blocksReplaced }
}

export function createDocumentCollaborationApplication(dependencies: DocumentCollaborationDependencies) {
  const runtime = new DocumentRoomRuntime(dependencies)
  return {
    subscribe: runtime.subscribe.bind(runtime),
    unsubscribe: runtime.unsubscribe.bind(runtime),
    applyLocalUpdate: runtime.applyLocalUpdate.bind(runtime),
    broadcastAwareness: runtime.broadcastAwareness.bind(runtime),
    boot: runtime.boot.bind(runtime),
    instanceOrigin: runtime.instanceOrigin.bind(runtime),
    readDocumentText: (documentId: string, companyId: string) => (
      readDocumentText(runtime, dependencies.imageStorage, documentId, companyId)
    ),
    applyAgentEdit: (
      documentId: string,
      companyId: string,
      agentId: string,
      operations: AgentDocumentEditOperation[],
    ) => applyAgentEdit(runtime, documentId, companyId, agentId, operations),
  }
}

export type DocumentCollaborationApplication = ReturnType<typeof createDocumentCollaborationApplication>
