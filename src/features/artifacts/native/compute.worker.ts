import { BoundsIndex, ElementIndexes } from './compute-geometry'
import { resolveTheme } from './compute-bulk'
import type { ComputeMessage, ComputeRequest, ComputeResponse, ComputeValue, MathResult } from './compute-protocol'

const scope = globalThis as unknown as {
  postMessage(message: ComputeResponse): void
  onmessage: ((event: MessageEvent<ComputeMessage>) => void) | null
}
const bounds = new BoundsIndex()
const elements = new ElementIndexes()
const running = new Set<number>()
const cancelled = new Set<number>()
let geometryRevision = -1
let latestRevision = -1
const mathCache = new Map<string, MathResult>()
let mathBytes = 0
let katex: Promise<typeof import('katex')> | undefined

async function math(source: string, display: boolean): Promise<MathResult> {
  if (source.length > 16_000) return { html: '', error: '公式过长，请拆成多个公式。' }
  const key = `${display ? 'display' : 'inline'}:${source}`
  const cached = mathCache.get(key)
  if (cached) { mathCache.delete(key); mathCache.set(key, cached); return cached }
  let result: MathResult
  try {
    katex ??= import('katex').catch(error => { katex = undefined; throw error })
    const renderer = await katex
    result = { html: renderer.renderToString(source, {
      displayMode: display, throwOnError: true, trust: false, output: 'htmlAndMathml',
      maxExpand: 1000, maxSize: 100,
    }) }
  } catch {
    return { html: '', error: '公式未能渲染，保留原始公式。' }
  }
  // Traversing a long deck must not retain every rendered formula forever.
  mathCache.set(key, result)
  mathBytes += key.length + result.html.length
  while (mathCache.size > 64 || mathBytes > 512_000) {
    const first = mathCache.keys().next().value
    if (first === undefined) break
    mathBytes -= first.length + mathCache.get(first)!.html.length
    mathCache.delete(first)
  }
  return result
}

async function execute(request: ComputeRequest) {
  const { id, revision, task } = request
  running.add(id)
  latestRevision = Math.max(latestRevision, revision)
  try {
    if (revision < latestRevision) throw new Error('stale_revision')
    let value: ComputeValue = null
    if (task.kind === 'pages' || task.kind === 'update-pages') {
      if (revision < geometryRevision) throw new Error('stale_revision')
      if (task.kind === 'pages') bounds.replace(task.pages)
      else bounds.update(task.upserts, task.removed)
      geometryRevision = revision
    } else if(task.kind==='pen'){
      value=(await import('../../../../shared/artifact-pen')).fitCanvasPen(task.points,task.tolerance,true)
    } else if (task.kind === 'math') {
      value = await math(task.source, task.display)
    } else if (task.kind === 'project-elements') {
      value = elements.project(task.pageId, task.geometry, task.viewport, revision, task.geometryKey)
    } else if (task.kind === 'drop-elements') {
      elements.drop(task.pageId)
    } else if (task.kind === 'resolve-theme') {
      value = resolveTheme(task.tokens)
    } else {
      if (revision !== geometryRevision) throw new Error('stale_index')
      value = task.kind === 'visible' ? bounds.visible(task.viewport) : bounds.snap(task.point, task.tolerance)
    }
    if (!cancelled.has(id) && revision === latestRevision) scope.postMessage({ id, revision, value })
  } catch (reason) {
    if (!cancelled.has(id)) scope.postMessage({ id, revision, error: reason instanceof Error ? reason.message : 'compute_failed' })
  } finally { running.delete(id); cancelled.delete(id) }
}

scope.onmessage = event => {
  if ('cancel' in event.data) {
    if (running.has(event.data.cancel)) cancelled.add(event.data.cancel)
    return
  }
  void execute(event.data)
}
