import { z } from 'zod'
import { canvasPages, canvasPageOf } from './artifact-canvas-pages.js'
import {nodeTransform} from './artifact-appearance.js'
import {
  artifactAssetSchema, artifactDocumentSchema, artifactIdSchema, artifactNodeSchema, artifactPageSchema,
  artifactStyleSchema, artifactThemeSchema, validateArtifactDocument, validateArtifactCanvasPages,
  type ArtifactDocument, type ArtifactNode, type ArtifactPage,
} from './artifact-document.js'

const nodePatchSchema = artifactNodeSchema.omit({ id: true, type: true }).partial()
const pagePatchSchema = artifactPageSchema.omit({ id: true, nodes: true, nodeOrder: true }).partial()
const optionalNodeFields = new Set(['css', 'attributes', 'motionId', 'text', 'textSizing', 'richText', 'source', 'assetId', 'posterAssetId', 'name', 'scope', 'flipX', 'flipY', 'lineStart', 'lineEnd', 'crop', 'shape', 'points', 'path', 'cells', 'tableHeader', 'svg', 'embed', 'layout', 'locked', 'hidden', 'animation'])
const unsetFieldSchema = z.string().refine(field => optionalNodeFields.has(field) || field.startsWith('style.') && Object.hasOwn(artifactStyleSchema.shape, field.slice(6)), 'field cannot be removed')
const indexSchema = z.number().int().min(0).max(10_000).optional()

export const artifactOperationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('document.patch'), patch: artifactDocumentSchema.pick({ title: true, themeId: true, canvasPages: true }).partial(), unset: z.array(z.literal('canvasPages')).max(1).optional() }).strict(),
  z.object({ type: z.literal('page.insert'), page: artifactPageSchema, index: indexSchema }).strict(),
  z.object({ type: z.literal('page.patch'), pageId: artifactIdSchema, patch: pagePatchSchema, unset: z.array(z.enum(['sizing', 'print', 'paper', 'themeBackground', 'section', 'guides', 'layoutGuides', 'canvasPageId', 'interactive', 'frameless', 'radius'])).max(11).optional() }).strict(),
  z.object({ type: z.literal('page.delete'), pageId: artifactIdSchema }).strict(),
  z.object({ type: z.literal('pages.reorder'), pageIds: z.array(artifactIdSchema).max(1000) }).strict(),
  z.object({ type: z.literal('node.insert'), pageId: artifactIdSchema, node: artifactNodeSchema, index: indexSchema }).strict(),
  z.object({ type: z.literal('node.patch'), pageId: artifactIdSchema, nodeId: artifactIdSchema, patch: nodePatchSchema, unset: z.array(unsetFieldSchema).max(100).optional() }).strict(),
  z.object({ type: z.literal('node.replace'), pageId: artifactIdSchema, nodeId: artifactIdSchema, node: artifactNodeSchema }).strict(),
  z.object({ type: z.literal('node.delete'), pageId: artifactIdSchema, nodeId: artifactIdSchema }).strict(),
  z.object({ type: z.literal('nodes.reorder'), pageId: artifactIdSchema, nodeIds: z.array(artifactIdSchema).max(10_000) }).strict(),
  z.object({ type: z.literal('theme.set'), theme: artifactThemeSchema }).strict(),
  z.object({ type: z.literal('theme.delete'), themeId: artifactIdSchema }).strict(),
  z.object({ type: z.literal('asset.set'), asset: artifactAssetSchema }).strict(),
  z.object({ type: z.literal('asset.delete'), assetId: artifactIdSchema }).strict(),
])
export type ArtifactOperation = z.infer<typeof artifactOperationSchema>

export const artifactOperationBatchSchema = z.object({
  operationId: artifactIdSchema,
  baseSeq: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  expectedVersions: z.record(z.string().max(512).refine(key => !['__proto__', 'constructor', 'prototype'].includes(key)), z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)),
  operations: z.array(artifactOperationSchema).min(1).max(1000),
}).strict()
export type ArtifactOperationBatch = z.infer<typeof artifactOperationBatchSchema>
export interface ArtifactVersionConflict { key: string; expected: number | null; actual: number }
export class ArtifactOperationConflict extends Error {
  readonly code = 'document_conflict'
  readonly status = 409
  constructor(readonly conflicts: ArtifactVersionConflict[]) {
    super('Document targets changed; read the conflicting values before retrying.')
    this.name = 'ArtifactOperationConflict'
  }
}
export interface ArtifactOperationResult {
  document: ArtifactDocument
  inverse: ArtifactOperation[]
  changedPageIds: string[]
  changedKeys: string[]
}

/** Aggregate versions guard deletes/replaces; leaf versions allow independent fields to merge. */
export const artifactVersionKey = {
  document: (field: string) => `document/${field}`,
  page: (pageId: string, field?: string) => `page/${pageId}${field ? `/${field}` : ''}`,
  node: (pageId: string, nodeId: string, field?: string) => `node/${pageId}/${nodeId}${field ? `/${field}` : ''}`,
  canvasPage: (id: string) => `canvasPage/${id}/members`,
  theme: (themeId: string) => `theme/${themeId}`,
  asset: (assetId: string) => `asset/${assetId}`,
}

function fieldsOf(patch: Record<string, unknown>): Array<[string, unknown]> {
  return Object.entries(patch).flatMap(([key, value]) => key === 'style'
    ? Object.entries(value as Record<string, unknown>).map(([name, item]): [string, unknown] => [`style.${name}`, item])
    : [[key, value] as [string, unknown]])
}
function readField(node: ArtifactNode, field: string): unknown {
  if (field.startsWith('style.')) return (node.style as Record<string, unknown>)[field.slice(6)]
  return (node as unknown as Record<string, unknown>)[field]
}
function setField(node: ArtifactNode, field: string, value: unknown) {
  const target = field.startsWith('style.') ? node.style as Record<string, unknown> : node as unknown as Record<string, unknown>
  const key = field.startsWith('style.') ? field.slice(6) : field
  if (value === undefined) delete target[key]
  else target[key] = structuredClone(value)
}
function patchFromFields(fields: Array<[string, unknown]>): { patch: z.infer<typeof nodePatchSchema>; unset: string[] } {
  const result: { patch: Record<string, unknown>; unset: string[] } = { patch: {}, unset: [] }
  for (const [key, value] of fields) {
    if (value === undefined) result.unset.push(key)
    else if (key.startsWith('style.')) {
      result.patch.style ??= {}
      ;(result.patch.style as Record<string, unknown>)[key.slice(6)] = structuredClone(value)
    } else result.patch[key] = structuredClone(value)
  }
  return result as { patch: z.infer<typeof nodePatchSchema>; unset: string[] }
}
function sameSet(order: string[], existing: string[]) {
  return order.length === existing.length && new Set(order).size === order.length && order.every(id => existing.includes(id))
}

interface PlannedOperations extends ArtifactOperationResult { requiredKeys: string[] }

/** Only affected pages are copied. Pointer previews never call this reducer. */
function planOperations(before: ArtifactDocument, operations: ArtifactOperation[]): PlannedOperations {
  const document: ArtifactDocument = { ...before, pages: { ...before.pages }, versions: { ...before.versions }, themes: { ...before.themes }, assets: { ...before.assets }, pageOrder: [...before.pageOrder] }
  const required = new Set<string>(), changed = new Set<string>(), pageIds = new Set<string>()
  const inverseGroups: ArtifactOperation[][] = []
  const key = artifactVersionKey
  const requireKey = (...keys: string[]) => keys.forEach(value => { required.add(value) })
  const change = (...keys: string[]) => keys.forEach(value => { changed.add(value) })
  const page = (pageId: string): ArtifactPage => {
    if (!Object.hasOwn(document.pages, pageId)) throw new Error(`Unknown page: ${pageId}`)
    if (!pageIds.has(pageId)) {
      document.pages[pageId] = structuredClone(document.pages[pageId]!)
      pageIds.add(pageId)
    }
    return document.pages[pageId]!
  }
  const node = (pageId: string, nodeId: string) => {
    const owner = page(pageId)
    if (!Object.hasOwn(owner.nodes, nodeId)) throw new Error(`Unknown node: ${nodeId}`)
    return owner.nodes[nodeId]!
  }
  const ancestors = (owner: ArtifactPage, item: ArtifactNode) => {
    const visited = new Set<string>()
    let parentId = item.parentId
    while (parentId !== null && !visited.has(parentId)) {
      visited.add(parentId)
      change(key.node(owner.id, parentId))
      parentId = owner.nodes[parentId]?.parentId ?? null
    }
  }
  const changedNode = (owner: ArtifactPage, item: ArtifactNode, fields: string[]) => {
    change(key.page(owner.id), key.node(owner.id, item.id), ...fields.map(field => key.node(owner.id, item.id, `field/${field}`)))
    ancestors(owner, item)
  }
  const changedAssetReferences = (item: ArtifactNode) => {
    if (item.posterAssetId) change(`${key.asset(item.posterAssetId)}/references`)
    if (item.assetId) change(`${key.asset(item.assetId)}/references`)
    if (item.embed?.previewAssetId) change(`${key.asset(item.embed.previewAssetId)}/references`)
  }
  for (const operation of operations) {
    switch (operation.type) {
      case 'document.patch': {
        const previous: Record<string, unknown> = {}, previousUnset: Array<'canvasPages'> = []
        const fields: Array<[string, unknown]> = [...Object.entries(operation.patch), ...(operation.unset??[]).map(field=>[field, undefined] as [string, unknown])]
        if (new Set(fields.map(([field])=>field)).size !== fields.length) throw new Error('A field cannot be patched and removed in one operation')
        for (const [field, value] of fields) {
          requireKey(key.document(field)); change(key.document(field))
          if (field === 'themeId' && typeof value === 'string') requireKey(key.theme(value))
          if (field === 'canvasPages') {
            const retained = new Set((value as ArtifactDocument['canvasPages'] ?? canvasPages({})).map(page=>page.id))
            for (const removed of canvasPages(document).filter(page=>!retained.has(page.id))) requireKey(key.canvasPage(removed.id))
          }
          const record = document as unknown as Record<string, unknown>
          if (record[field] === undefined) previousUnset.push(field as 'canvasPages')
          else previous[field] = structuredClone(record[field])
          if (value === undefined) delete record[field]
          else record[field] = structuredClone(value)
        }
        inverseGroups.push([{ type: 'document.patch', patch: previous, ...(previousUnset.length?{unset:previousUnset}:{}) }])
        break
      }
      case 'page.insert': {
        const id = operation.page.id
        if (document.kind === 'design') { requireKey(key.document('canvasPages')); change(key.canvasPage(canvasPageOf(operation.page))) }
        const content=operation.page.width===0&&operation.page.height===0
        requireKey(key.page(id, 'exists'));if(!content)requireKey(key.document('pageOrder'))
        if (Object.hasOwn(document.pages, id)) throw new Error(`Page already exists: ${id}`)
        document.pages[id] = structuredClone(operation.page)
        if(!content)document.pageOrder.splice(operation.index ?? document.pageOrder.length, 0, id)
        pageIds.add(id)
        change(key.page(id, 'exists'), key.page(id), key.page(id, 'nodeOrder'));if(!content)change(key.document('pageOrder'))
        for (const item of Object.values(operation.page.nodes)) change(key.node(id, item.id, 'exists'), key.node(id, item.id))
        for (const item of Object.values(operation.page.nodes)) {
          if (item.posterAssetId) requireKey(key.asset(item.posterAssetId))
        if (item.assetId) requireKey(key.asset(item.assetId))
          if (item.embed?.previewAssetId) requireKey(key.asset(item.embed.previewAssetId))
          changedAssetReferences(item)
        }
        inverseGroups.push([{ type: 'page.delete', pageId: id }])
        break
      }
      case 'page.patch': {
        const owner = page(operation.pageId)
        const originalCanvasPage = canvasPageOf(owner)
        requireKey(key.page(owner.id, 'exists'))
        const previous: Record<string, unknown> = {}
        const previousUnset: NonNullable<Extract<ArtifactOperation,{type:'page.patch'}>['unset']> = []
        const unsets = [...operation.unset ?? []]
        if (Object.hasOwn(operation.patch, 'background') && !Object.hasOwn(operation.patch, 'themeBackground') && !unsets.includes('themeBackground')) unsets.push('themeBackground')
        const fields: Array<[string, unknown]> = [...Object.entries(operation.patch), ...unsets.map((field): [string, unknown] => [field, undefined])]
        if (new Set(fields.map(([field]) => field)).size !== fields.length) throw new Error('A field cannot be patched and removed in one operation')
        for (const [field, value] of fields) {
          requireKey(key.page(owner.id, `field/${field}`)); change(key.page(owner.id, `field/${field}`), key.page(owner.id))
          const record = owner as unknown as Record<string, unknown>
          if (record[field] === undefined) previousUnset.push(field as typeof previousUnset[number])
          else previous[field] = record[field]
          if (value === undefined) delete record[field]
          else record[field] = value
        }
        if (document.kind === 'design' && originalCanvasPage !== canvasPageOf(owner)) { requireKey(key.document('canvasPages')); change(key.canvasPage(originalCanvasPage),key.canvasPage(canvasPageOf(owner))) }
        inverseGroups.push([{ type: 'page.patch', pageId: owner.id, patch: previous, ...(previousUnset.length ? { unset: previousUnset } : {}) }])
        break
      }
      case 'page.delete': {
        const owner = page(operation.pageId)
        if (document.kind === 'design') change(key.canvasPage(canvasPageOf(owner)))
        const content=!document.pageOrder.includes(owner.id)
        requireKey(key.page(owner.id), key.page(owner.id, 'exists'));if(content)requireKey(key.document('canvasPages'));else requireKey(key.document('pageOrder'))
        inverseGroups.push([{ type: 'page.insert', page: structuredClone(owner), ...(!content?{index:document.pageOrder.indexOf(owner.id)}:{}) }])
        document.pageOrder = document.pageOrder.filter(id => id !== owner.id)
        delete document.pages[owner.id]
        change(key.page(owner.id), key.page(owner.id, 'exists'));if(!content)change(key.document('pageOrder'))
        for (const item of Object.values(owner.nodes)) {
          change(key.node(owner.id, item.id), key.node(owner.id, item.id, 'exists'))
          changedAssetReferences(item)
        }
        break
      }
      case 'pages.reorder': {
        requireKey(key.document('pageOrder')); change(key.document('pageOrder'))
        if (!sameSet(operation.pageIds, document.pageOrder)) throw new Error('Page order must be a permutation of current pages')
        inverseGroups.push([{ type: 'pages.reorder', pageIds: [...document.pageOrder] }])
        document.pageOrder = [...operation.pageIds]
        break
      }
      case 'node.insert': {
        const owner = page(operation.pageId), item = structuredClone(operation.node)
        requireKey(key.page(owner.id, 'exists'), key.node(owner.id, item.id, 'exists'), key.page(owner.id, 'nodeOrder'))
        if (Object.hasOwn(owner.nodes, item.id)) throw new Error(`Node already exists: ${item.id}`)
        if (item.parentId) requireKey(key.node(owner.id, item.parentId, 'exists'))
        if (item.posterAssetId) requireKey(key.asset(item.posterAssetId))
        if (item.assetId) requireKey(key.asset(item.assetId))
        if (item.embed?.previewAssetId) requireKey(key.asset(item.embed.previewAssetId))
        owner.nodes[item.id] = item
        changedAssetReferences(item)
        owner.nodeOrder.splice(operation.index ?? owner.nodeOrder.length, 0, item.id)
        change(key.node(owner.id, item.id, 'exists'), key.page(owner.id, 'nodeOrder'))
        changedNode(owner, item, fieldsOf(item as unknown as Record<string, unknown>).map(([field]) => field))
        inverseGroups.push([{ type: 'node.delete', pageId: owner.id, nodeId: item.id }])
        break
      }
      case 'node.patch': {
        const owner = page(operation.pageId), item = node(owner.id, operation.nodeId)
        const fields = fieldsOf(operation.patch)
        const unsets = [...operation.unset ?? []]
        if(item.css&&!Object.hasOwn(operation.patch,'css')&&!unsets.includes('css')){
          const css={...item.css};let updated=false
          for(const [field,property]of [['x','left'],['y','top'],['width','width'],['height','height']] as const){
            if(Object.hasOwn(operation.patch,field)&&Object.hasOwn(css,property)){css[property]=`${operation.patch[field]}px${/!important\s*$/i.test(css[property])?' !important':''}`;updated=true}
          }
          if(['rotation','flipX','flipY'].some(field=>Object.hasOwn(operation.patch,field))&&Object.hasOwn(css,'transform')){css.transform=nodeTransform({...item,...operation.patch});updated=true}
          if(updated)fields.push(['css',css])
        }
        // Plain text replaces the visible rich-text value; guard both representations,
        // even when richText was absent in the observed snapshot.
        if ((item.type === 'text' || item.type === 'note') && Object.hasOwn(operation.patch, 'text') && !Object.hasOwn(operation.patch, 'richText') && !unsets.includes('richText')) unsets.push('richText')
        if (new Set([...fields.map(([field]) => field), ...unsets]).size !== fields.length + unsets.length) throw new Error('A field cannot be patched and removed in one operation')
        const entries: Array<[string, unknown]> = [...fields, ...unsets.map((field): [string, unknown] => [field, undefined])]
        requireKey(key.page(owner.id, 'exists'), key.node(owner.id, item.id, 'exists'), ...entries.map(([field]) => key.node(owner.id, item.id, `field/${field}`)))
        const previous = patchFromFields(entries.map(([field]) => [field, readField(item, field)]))
        if (operation.patch.posterAssetId) requireKey(key.asset(operation.patch.posterAssetId))
        if (operation.patch.assetId) requireKey(key.asset(operation.patch.assetId))
        if (operation.patch.embed?.previewAssetId) requireKey(key.asset(operation.patch.embed.previewAssetId))
        if (Object.hasOwn(operation.patch, 'parentId')) {
          requireKey(key.page(owner.id, 'nodeOrder'))
          change(key.page(owner.id, 'nodeOrder'))
          ancestors(owner, item)
          if (operation.patch.parentId) requireKey(key.node(owner.id, operation.patch.parentId, 'exists'))
        }
        const changesAsset = entries.some(([field]) => field === 'assetId' || field === 'posterAssetId' || field === 'embed')
        if (changesAsset) changedAssetReferences(item)
        for (const [field, value] of entries) setField(item, field, value)
        if (changesAsset) changedAssetReferences(item)
        changedNode(owner, item, entries.map(([field]) => field))
        inverseGroups.push([{ type: 'node.patch', pageId: owner.id, nodeId: item.id, ...previous }])
        break
      }
      case 'node.replace': {
        const owner = page(operation.pageId), previous = node(owner.id, operation.nodeId)
        if (operation.node.id !== previous.id) throw new Error('Replacing a node must retain its id')
        requireKey(key.page(owner.id, 'exists'), key.node(owner.id, previous.id, 'exists'), key.node(owner.id, previous.id))
        inverseGroups.push([{ type: 'node.replace', pageId: owner.id, nodeId: previous.id, node: structuredClone(previous) }])
        if (previous.parentId !== operation.node.parentId) {
          requireKey(key.page(owner.id, 'nodeOrder')); change(key.page(owner.id, 'nodeOrder')); ancestors(owner, previous)
          if (operation.node.parentId) requireKey(key.node(owner.id, operation.node.parentId, 'exists'))
        }
        const item = structuredClone(operation.node)
        if (item.posterAssetId) requireKey(key.asset(item.posterAssetId))
        if (item.assetId) requireKey(key.asset(item.assetId))
        if (item.embed?.previewAssetId) requireKey(key.asset(item.embed.previewAssetId))
        changedAssetReferences(previous)
        changedAssetReferences(item)
        owner.nodes[item.id] = item
        change(key.node(owner.id, item.id, 'exists'))
        changedNode(owner, item, [...new Set([...fieldsOf(previous as unknown as Record<string, unknown>), ...fieldsOf(item as unknown as Record<string, unknown>)].map(([field]) => field))])
        break
      }
      case 'node.delete': {
        const owner = page(operation.pageId), item = node(owner.id, operation.nodeId)
        const removed = new Set([item.id])
        let count = -1
        while (count !== removed.size) {
          count = removed.size
          for (const entry of Object.values(owner.nodes)) if (entry.parentId && removed.has(entry.parentId)) removed.add(entry.id)
        }
        requireKey(key.page(owner.id, 'exists'), key.page(owner.id, 'nodeOrder'))
        const inverse: ArtifactOperation[] = []
        owner.nodeOrder.forEach((id, index) => {
          if (!removed.has(id)) return
          requireKey(key.node(owner.id, id), key.node(owner.id, id, 'exists'))
          inverse.push({ type: 'node.insert', pageId: owner.id, node: structuredClone(owner.nodes[id]!), index })
          changedAssetReferences(owner.nodes[id]!)
          change(key.node(owner.id, id), key.node(owner.id, id, 'exists'))
        })
        ancestors(owner, item)
        for (const id of removed) delete owner.nodes[id]
        owner.nodeOrder = owner.nodeOrder.filter(id => !removed.has(id))
        change(key.page(owner.id), key.page(owner.id, 'nodeOrder'))
        inverseGroups.push(inverse)
        break
      }
      case 'nodes.reorder': {
        const owner = page(operation.pageId)
        requireKey(key.page(owner.id, 'exists'), key.page(owner.id, 'nodeOrder'))
        if (!sameSet(operation.nodeIds, owner.nodeOrder)) throw new Error('Node order must be a permutation of current nodes')
        inverseGroups.push([{ type: 'nodes.reorder', pageId: owner.id, nodeIds: [...owner.nodeOrder] }])
        owner.nodeOrder = [...operation.nodeIds]
        change(key.page(owner.id), key.page(owner.id, 'nodeOrder'))
        break
      }
      case 'theme.set': {
        const id = operation.theme.id, previous = document.themes[id]
        requireKey(key.theme(id)); change(key.theme(id))
        inverseGroups.push(previous ? [{ type: 'theme.set', theme: structuredClone(previous) }] : [{ type: 'theme.delete', themeId: id }])
        document.themes[id] = structuredClone(operation.theme)
        break
      }
      case 'theme.delete': {
        const previous = document.themes[operation.themeId]
        if (!previous) throw new Error('Unknown theme')
        requireKey(key.theme(operation.themeId), key.document('themeId')); change(key.theme(operation.themeId))
        inverseGroups.push([{ type: 'theme.set', theme: structuredClone(previous) }])
        delete document.themes[operation.themeId]
        break
      }
      case 'asset.set': {
        const id = operation.asset.id, previous = document.assets[id]
        requireKey(key.asset(id)); change(key.asset(id))
        inverseGroups.push(previous ? [{ type: 'asset.set', asset: structuredClone(previous) }] : [{ type: 'asset.delete', assetId: id }])
        document.assets[id] = structuredClone(operation.asset)
        break
      }
      case 'asset.delete': {
        const previous = document.assets[operation.assetId]
        if (!previous) throw new Error('Unknown asset')
        requireKey(key.asset(operation.assetId), `${key.asset(operation.assetId)}/references`); change(key.asset(operation.assetId))
        inverseGroups.push([{ type: 'asset.set', asset: structuredClone(previous) }])
        delete document.assets[operation.assetId]
        break
      }
    }
  }
  if (document.pageOrder.length > 1000) throw new Error('Too many pages')
  validateArtifactCanvasPages(document)
  // Validation is bounded to affected pages, except removing an asset which can invalidate any page.
  const validateAll = operations.some(operation => operation.type === 'asset.delete')
  const validatePages = validateAll ? document.pages : Object.fromEntries([...pageIds].filter(id => Object.hasOwn(document.pages, id)).map(id => [id, document.pages[id]!]))
  const validationCanvas=document.canvasPages?.map(sheet=>{if(sheet.contentId&&!Object.hasOwn(validatePages,sheet.contentId)){const{contentId:_content,...metadata}=sheet;return metadata}return sheet})
  validateArtifactDocument({ ...document, ...(validationCanvas?{canvasPages:validationCanvas}:{}), pageOrder: document.pageOrder.filter(id => Object.hasOwn(validatePages, id)), pages: validatePages })
  if (document.seq >= Number.MAX_SAFE_INTEGER) throw new Error('Document revision exhausted')
  document.seq++
  for (const field of changed) document.versions[field] = document.seq
  return { document, inverse: inverseGroups.reverse().flat(), changedPageIds: [...pageIds], changedKeys: [...changed], requiredKeys: [...required] }
}

/** Build preconditions from the exact snapshot used to decide the edit. Never prepare again merely to silence a conflict. */
export function prepareBatch(document: ArtifactDocument, input: ArtifactOperation[], operationId: string = globalThis.crypto.randomUUID()): ArtifactOperationBatch {
  const operations = z.array(artifactOperationSchema).min(1).max(1000).parse(input)
  const plan = planOperations(document, operations)
  return { operationId, baseSeq: document.seq, expectedVersions: Object.fromEntries(plan.requiredKeys.map(key => [key, document.versions[key] ?? 0])), operations }
}

/** The caller serializes accepted batches and their history in one database transaction. */
export function applyOperations(document: ArtifactDocument, input: ArtifactOperationBatch): ArtifactOperationResult {
  const batch = artifactOperationBatchSchema.parse(input)
  if (batch.baseSeq > document.seq) throw new ArtifactOperationConflict([{ key: 'document/seq', expected: batch.baseSeq, actual: document.seq }])
  const conflicts: ArtifactVersionConflict[] = Object.entries(batch.expectedVersions)
    .filter(([key, expected]) => (document.versions[key] ?? 0) !== expected)
    .map(([key, expected]) => ({ key, expected, actual: document.versions[key] ?? 0 }))
  if (conflicts.length) throw new ArtifactOperationConflict(conflicts)
  const plan = planOperations(document, batch.operations)
  const missing = plan.requiredKeys.filter(key => !Object.hasOwn(batch.expectedVersions, key))
  if (missing.length) throw new ArtifactOperationConflict(missing.map(key => ({ key, expected: null, actual: document.versions[key] ?? 0 })))
  const { requiredKeys: _requiredKeys, ...result } = plan
  return result
}
