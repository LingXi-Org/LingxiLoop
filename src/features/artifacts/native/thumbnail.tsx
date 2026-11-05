import { memo, useEffect, useState, type ReactNode } from 'react'
import { isSafeArtifactSvg, type ArtifactAsset, type ArtifactDocument, type ArtifactNode, type ArtifactPage, type ArtifactRichText, type ArtifactTheme } from '../../../../shared/artifact-document'
import { artifactPageBackground, artifactResolvedStyle } from '../../../../shared/artifact-themes'

const CACHE_ENTRIES = 128, CACHE_BYTES = 2 * 1024 * 1024
/** The caches retain small previews, not documents, page renderers or executable content. */
class PreviewCache<T> {
  private entries = new Map<string, { value: T; bytes: number }>()
  private bytes = 0
  get(key: string): T | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    this.entries.delete(key); this.entries.set(key, entry)
    return entry.value
  }
  set(key: string, value: T, bytes: number) {
    const old = this.entries.get(key)
    if (old) { this.bytes -= old.bytes; this.entries.delete(key) }
    if (bytes > CACHE_BYTES) return
    this.entries.set(key, { value, bytes }); this.bytes += bytes
    while (this.entries.size > CACHE_ENTRIES || this.bytes > CACHE_BYTES) {
      const first = this.entries.keys().next().value!
      this.bytes -= this.entries.get(first)!.bytes; this.entries.delete(first)
    }
  }
}
const images = new PreviewCache<string>()
const assetIds = new WeakMap<ArtifactAsset, string>()
let assetSequence = 0
function imageKey(documentId: string, asset: ArtifactAsset) {
  if (asset.sha256) return `${documentId}:${asset.id}:${asset.sha256}`
  let id = assetIds.get(asset)
  if (!id) { id = `${documentId}:${asset.id}:${++assetSequence}`; assetIds.set(asset, id) }
  return id
}

interface PreviewNode {
  id: string; type: ArtifactNode['type']; x: number; y: number; width: number; height: number; rotation: number
  fill: string; color: string; stroke: string; strokeWidth: number; opacity: number; radius: number
  fontSize: number; fontWeight: number; text: string; shape?: ArtifactNode['shape']; points?: string
  assetId?: string; imageKey?: string; crop?: ArtifactNode['crop']; svg?: string; cells?: string[][]; children?: PreviewNode[]
}
interface Preview { width: number; height: number; background: string; nodes: PreviewNode[] }
const previews = new PreviewCache<Preview>()
const references = new WeakMap<ArtifactPage, { theme: ArtifactTheme | undefined; assets: ArtifactDocument['assets']; preview: Preview }>()
const safeColor = (value: unknown, fallback: string) => typeof value === 'string' && !/[<>;\\]|url\s*\(|expression\s*\(|@import/i.test(value) ? value : fallback

function plainText(value: ArtifactRichText | undefined): string {
  if (!value) return ''
  const stack = [value], parts: string[] = []
  let length = 0
  while (stack.length && length < 512) {
    const node = stack.pop()!
    if (node.text) { parts.push(node.text); length += node.text.length }
    if (node.type === 'hardBreak' || node.type === 'paragraph') parts.push('\n')
    if (node.content) for (let i = node.content.length - 1; i >= 0; i--) stack.push(node.content[i]!)
  }
  return parts.join('').trim().slice(0, 512)
}

function describePage(page: ArtifactPage, document: ArtifactDocument): Preview {
  const theme = document.themeId ? document.themes[document.themeId] : undefined
  const cached = references.get(page)
  if (cached && cached.theme === theme && cached.assets === document.assets) return cached.preview
  const children = new Map<string | null, ArtifactNode[]>()
  for (const id of page.nodeOrder) {
    const node = page.nodes[id]
    if (!node || node.hidden) continue
    const list = children.get(node.parentId) ?? []; list.push(node); children.set(node.parentId, list)
  }
  let remaining = 96
  const describe = (node: ArtifactNode, x = node.x, y = node.y): PreviewNode => {
    remaining--
    const style = artifactResolvedStyle(node.style, document)
    const assetId = node.assetId ?? node.embed?.previewAssetId
    const asset = assetId ? document.assets[assetId] : undefined
    const preview: PreviewNode = {
      id: node.id, type: node.type, x, y, width: node.width, height: node.height, rotation: node.rotation,
      fill: safeColor(style.fill ?? style.backgroundColor, node.type === 'shape' ? '#d6e6ff' : 'transparent'),
      color: safeColor(style.color, '#222'),
      stroke: safeColor(style.stroke ?? style.borderColor, node.type === 'line' ? '#333' : 'transparent'),
      strokeWidth: style.strokeWidth ?? style.borderWidth ?? (node.type === 'line' ? 3 : 1),
      opacity: style.opacity ?? 1, radius: style.borderRadius ?? 0, fontSize: style.fontSize ?? 32, fontWeight: style.fontWeight ?? 400,
      text: (node.type === 'math' ? node.source ?? '' : node.text ?? plainText(node.richText)).slice(0, 512),
      shape: node.shape, crop: node.crop,
      ...(asset ? { assetId, imageKey: imageKey(document.id, asset) } : {}),
      ...(node.type === 'line' ? { points: (node.points ?? [{ x: 0, y: node.height / 2 }, { x: node.width, y: node.height / 2 }]).map(point => `${point.x},${point.y}`).join(' ') } : {}),
      ...(node.type === 'svg' && node.svg && isSafeArtifactSvg(node.svg) ? { svg: node.svg } : {}),
      ...(node.type === 'table' ? { cells: node.cells?.slice(0, 12).map(row => row.slice(0, 8).map(cell => cell.slice(0, 48))) } : {}),
    }
    if (node.type === 'group') {
      const members = children.get(node.id) ?? [], layout = node.layout
      const gap = layout?.gap ?? 0
      const padding = style.padding ?? 0
      let cursor = padding
      const columns = layout?.columns ?? 1
      const gridRows = Math.max(1, Math.ceil(members.length / columns))
      preview.children = members.flatMap((child, index) => {
        if (remaining <= 0) return []
        if (layout?.mode === 'flex') {
          const horizontal = layout.direction === 'row'
          const item = describe(child, horizontal ? cursor : padding, horizontal ? padding : cursor)
          cursor += (horizontal ? child.width : child.height) + gap
          return [item]
        }
        if (layout?.mode === 'grid') return [describe(child,
          padding + index % columns * ((node.width - 2 * padding + gap) / columns),
          padding + Math.floor(index / columns) * ((node.height - 2 * padding + gap) / gridRows))]
        return [describe(child)]
      })
    }
    return preview
  }
  const preview = { width: page.width, height: page.height, background: safeColor(artifactPageBackground(page, document), '#fff'), nodes: (children.get(null) ?? []).slice(0, 96).flatMap(node => remaining > 0 ? [describe(node)] : []) }
  references.set(page, { theme, assets: document.assets, preview })
  previews.set(`${document.id}:${page.id}`, preview, JSON.stringify(preview).length * 2)
  return preview
}

type ImageTask = { start(): void; cancel(): void }
const imageQueue: ImageTask[] = []
let activeImages = 0
function pumpImages() { while (activeImages < 2 && imageQueue.length) imageQueue.shift()!.start() }
function scheduleImage<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    let started = false
    const task: ImageTask = {
      start() {
        if (signal.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return }
        started = true; activeImages++
        signal.removeEventListener('abort', task.cancel)
        void work().then(resolve, reject).finally(() => { activeImages--; pumpImages() })
      },
      cancel() {
        if (started) return
        const index = imageQueue.indexOf(task)
        if (index >= 0) imageQueue.splice(index, 1)
        signal.removeEventListener('abort', task.cancel)
        reject(new DOMException('Cancelled', 'AbortError'))
      },
    }
    if (signal.aborted) { task.cancel(); return }
    signal.addEventListener('abort', task.cancel, { once: true })
    imageQueue.push(task); pumpImages()
  })
}
async function loadImage(asset: ArtifactAsset, artifactId: string, key: string, signal: AbortSignal) {
  return scheduleImage(signal, async () => {
    const cached = images.get(key)
    if (cached) return cached
    const { fetchArtifactAsset } = await import('./assets')
    const blob = await fetchArtifactAsset(asset, artifactId, signal)
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
    const ratio = asset.width && asset.height ? Math.min(1, 160 / asset.width, 90 / asset.height) : null
    const bitmap = await createImageBitmap(blob, ratio ? { resizeWidth: Math.max(1, Math.round(asset.width! * ratio)), resizeHeight: Math.max(1, Math.round(asset.height! * ratio)), resizeQuality: 'low' } : undefined)
    try {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
      const scale = Math.min(1, 160 / bitmap.width, 90 / bitmap.height)
      const canvas = window.document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Thumbnail canvas unavailable')
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const source = canvas.toDataURL('image/webp', .65)
      images.set(key, source, source.length * 2)
      canvas.width = 0; canvas.height = 0
      return source
    } finally { bitmap.close() }
  })
}

function ThumbnailImage({ node, document, loaded }: { node: PreviewNode; document: ArtifactDocument; loaded: boolean }) {
  const [state, setState] = useState<{ key: string; source: string } | null>(() => {
    const source = node.imageKey ? images.get(node.imageKey) : undefined
    return source && node.imageKey ? { key: node.imageKey, source } : null
  })
  const asset = node.assetId ? document.assets[node.assetId] : undefined
  useEffect(() => {
    const key = node.imageKey
    if (!key) return
    const cached = images.get(key)
    if (cached) { setState({ key, source: cached }); return }
    if (!loaded || !asset) return
    const controller = new AbortController()
    void loadImage(asset, document.id, key, controller.signal).then(source => {
      if (!controller.signal.aborted) setState({ key, source })
    }).catch(() => { /* An unavailable image remains a neutral thumbnail shape. */ })
    return () => controller.abort()
  }, [node.imageKey, asset, loaded, document.id])
  const source = state && state.key === node.imageKey ? state.source : node.imageKey ? images.get(node.imageKey) : undefined
  if (!source) return <rect width={node.width} height={node.height} fill="#e1e5eb" />
  const crop = node.crop ?? { x: 0, y: 0, width: 1, height: 1 }
  return <svg width={node.width} height={node.height} overflow="hidden"><image href={source}
    x={-crop.x * node.width / Math.max(.01, crop.width)} y={-crop.y * node.height / Math.max(.01, crop.height)}
    width={node.width / Math.max(.01, crop.width)} height={node.height / Math.max(.01, crop.height)} preserveAspectRatio="xMidYMid slice" /></svg>
}

function PreviewShape({ node, document, loaded }: { node: PreviewNode; document: ArtifactDocument; loaded: boolean }) {
  const { width: w, height: h } = node
  let content: ReactNode
  const paint = { fill: node.fill, stroke: node.stroke, strokeWidth: node.strokeWidth }
  if (node.type === 'image' || node.type === 'embed' && node.imageKey) content = <ThumbnailImage node={node} document={document} loaded={loaded} />
  else if (node.type === 'svg' && node.svg) content = <image href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(node.svg)}`} width={w} height={h} />
  else if (node.type === 'line') content = <polyline points={node.points} fill="none" stroke={node.stroke} strokeWidth={node.strokeWidth} />
  else if (node.type === 'shape') content = node.shape === 'ellipse' ? <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...paint} />
    : node.shape === 'triangle' ? <polygon points={`${w / 2},0 ${w},${h} 0,${h}`} {...paint} />
      : node.shape === 'diamond' ? <polygon points={`${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`} {...paint} />
        : node.shape === 'arrow' ? <polygon points={`0,${h * .3} ${w * .65},${h * .3} ${w * .65},0 ${w},${h / 2} ${w * .65},${h} ${w * .65},${h * .7} 0,${h * .7}`} {...paint} />
          : <rect width={w} height={h} rx={node.radius} {...paint} />
  else if (node.type === 'table') {
    const rows = node.cells ?? [], cols = Math.max(1, ...rows.map(row => row.length)), rowHeight = h / Math.max(1, rows.length), columnWidth = w / cols
    content = rows.map((row, rowIndex) => row.map((cell, colIndex) => <g key={`${rowIndex}-${colIndex}`} transform={`translate(${colIndex * columnWidth} ${rowIndex * rowHeight})`}>
      <rect width={columnWidth} height={rowHeight} fill={rowIndex === 0 ? '#e6e9ef' : '#fff'} stroke={node.stroke === 'transparent' ? '#adb5c2' : node.stroke} strokeWidth={1} />
      <text x={4} y={Math.min(node.fontSize, rowHeight * .7)} fill={node.color} fontSize={Math.min(node.fontSize, rowHeight * .65)}>{cell.slice(0, 24)}</text>
    </g>))
  } else if (node.type === 'group') content = <><rect width={w} height={h} rx={node.radius} {...paint} />{node.children?.map(child => <PreviewShape key={child.id} node={child} document={document} loaded={loaded} />)}</>
  else content = <><rect width={w} height={h} rx={node.radius} {...paint} />{(node.type === 'embed' ? ['交互内容'] : node.text.split('\n').slice(0, 4)).map((line, index) => <text key={index} x={0} y={node.fontSize * (index * 1.2 + 1)} fill={node.color} fontSize={node.fontSize} fontWeight={node.fontWeight}>{line.slice(0, 100)}</text>)}</>
  return <g transform={`translate(${node.x} ${node.y}) rotate(${node.rotation} ${w / 2} ${h / 2})`} opacity={node.opacity}>{content}</g>
}

/** A lightweight visual summary; it never mounts an editor or executes an embed. */
export const PageThumbnail = memo(function PageThumbnail({ page, document, loaded }: { page: ArtifactPage; document: ArtifactDocument; loaded: boolean }) {
  const preview = loaded ? describePage(page, document) : previews.get(`${document.id}:${page.id}`)
  return <svg aria-hidden="true" focusable="false" width="64" height="40" viewBox={`0 0 ${preview?.width ?? page.width} ${preview?.height ?? page.height}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block', width: 64, height: 40, flexShrink: 0, borderRadius: 3, overflow: 'hidden', background: '#e8eaee' }}>
    <rect width={preview?.width ?? page.width} height={preview?.height ?? page.height} fill={preview?.background ?? safeColor(artifactPageBackground(page, document), '#fff')} />
    {preview?.nodes.map(node => <PreviewShape key={node.id} node={node} document={document} loaded={loaded} />)}
  </svg>
})
