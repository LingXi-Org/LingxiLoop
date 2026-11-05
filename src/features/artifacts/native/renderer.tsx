import { artifactShapeGeometry } from '../../../../shared/artifact-shapes'
import { createElement, Fragment, lazy, memo, Suspense, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { ArtifactAsset, ArtifactDocument, ArtifactNode, ArtifactPage, ArtifactRichText, ArtifactStyle } from '../../../../shared/artifact-document'
import { artifactPageBackground, artifactResolvedStyle } from '../../../../shared/artifact-themes'
import { http } from '@/api/core/http'
import { fetchArtifactAsset } from './assets'
import type { NativeCompute } from './compute'
import { useLocalDraft } from './draft-context'
import { appearance, nodeTransform } from '../../../../shared/artifact-appearance'

const RichTextEditor = lazy(() => import('./RichTextEditor'))
let mathStyles: Promise<unknown> | undefined
export function richTextContent(value: ArtifactRichText): ReactNode {
  if (value.type === 'text') {
    let content: ReactNode = value.text ?? ''
    for (const mark of value.marks ?? []) {
      if (mark.type === 'link') content = <a href={mark.attrs?.href} rel="noopener noreferrer" target={mark.attrs?.target}>{content}</a>
      else content = createElement(({ bold: 'strong', italic: 'em', underline: 'u', strike: 's', code: 'code' } as const)[mark.type], null, content)
    }
    return content
  }
  const content = value.content?.map((child, index) => <Fragment key={index}>{richTextContent(child)}</Fragment>)
  if (value.type === 'doc') return content
  if (value.type === 'hardBreak') return <br />
  const tag = value.type === 'heading' ? `h${value.attrs?.level ?? 2}` : ({ paragraph: 'p', bulletList: 'ul', orderedList: 'ol', listItem: 'li', blockquote: 'blockquote' } as const)[value.type]
  return createElement(tag, { style: { textAlign: value.attrs?.textAlign }, ...(value.type === 'orderedList' ? { start: value.attrs?.start } : {}) }, content)
}
export function nativeStyle(source: ArtifactStyle, document: ArtifactDocument): CSSProperties {
  const style = artifactResolvedStyle(source, document)
  return { ...appearance(style), backgroundColor: style.backgroundColor ?? style.fill, color: style.color, fontFamily: style.fontFamily,
    fontSize: style.fontSize ?? 32, fontWeight: style.fontWeight, fontStyle: style.fontStyle, textAlign: style.textAlign,
    textDecoration: style.textDecoration, lineHeight: style.lineHeight ?? 1.25, padding: style.padding,
    opacity: style.opacity, borderRadius: style.borderRadius,
    ...((style.borderColor ?? style.stroke) ? { border: `${style.borderWidth ?? style.strokeWidth ?? 1}px ${style.borderStyle ?? 'solid'} ${style.borderColor ?? style.stroke}` } : {}) }
}
function AssetVideo({ asset, documentId, presenting, style }: { asset: ArtifactAsset; documentId: string; presenting?: boolean; style?: CSSProperties }) {
  const [source, setSource] = useState<string | null>(null), [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController(); let url: string | undefined
    setSource(null); setFailed(false)
    void fetchArtifactAsset(asset, documentId, controller.signal).then(blob => { if (!controller.signal.aborted) { url = URL.createObjectURL(blob); setSource(url) } }).catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url) }
  }, [asset.url, asset.sha256, documentId, attempt])
  return failed ? <button type="button" onClick={() => setAttempt(v => v + 1)}>重试视频</button> : source ? <video src={source} controls={presenting} preload="metadata" playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', ...style }} /> : <span aria-busy="true">加载视频…</span>
}
function AssetImage({ asset, artifactId, alt, style }: { asset: ArtifactAsset; artifactId: string; alt: string; style: CSSProperties }) {
  const [source, setSource] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController(); let objectUrl: string | undefined
    setSource(null); setFailed(false)
    void fetchArtifactAsset(asset, artifactId, controller.signal).then(blob => {
      if (controller.signal.aborted) return
      objectUrl = URL.createObjectURL(blob); setSource(objectUrl)
    }).catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [asset.url, asset.sha256, artifactId, attempt])
  return failed ? <button type="button" onClick={() => setAttempt(value => value + 1)}>重试图片</button> : source ? <img src={source} alt={alt} draggable={false} decoding="async" style={style} /> : <span aria-busy="true" style={{ fontSize: 14 }}>加载图片…</span>
}
function IsolatedEmbed({ documentId, pageId, node, presenting, pageVersion, revisionSeq }: { documentId: string; pageId: string; node: ArtifactNode; presenting?: boolean;pageVersion?:string;revisionSeq?:string }) {
  const [url, setUrl] = useState<string | null>(null), [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!node.embed?.sourceHash) return
    const controller = new AbortController()
    setUrl(null); setFailed(false)
    void http<{ url: string }>(`/artifacts/${encodeURIComponent(documentId)}/embeds/${encodeURIComponent(pageId)}/${encodeURIComponent(node.id)}/grant`, { method: 'POST', body: JSON.stringify({ sha256: node.embed.sourceHash,...(pageVersion?{pageHash:pageVersion}:{}),...(revisionSeq!==undefined?{revisionSeq}:{}) }), signal: controller.signal }).then(grant => { if (!controller.signal.aborted) setUrl(grant.url) }).catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => controller.abort()
  }, [documentId, pageId, node.id, node.embed?.sourceHash, node.embed?.resourceVersion,pageVersion,revisionSeq])
  return url ? <iframe title={node.text ?? '隔离内容'} src={url} sandbox="allow-scripts" referrerPolicy="no-referrer" className="native-embed" style={{ pointerEvents: presenting ? 'auto' : 'none' }} /> : <div className="native-embed-wait">{failed ? '隔离内容暂时无法载入' : '正在载入隔离内容'}</div>
}
function MathContent({ source, revision, compute }: { source: string; revision: number; compute: NativeCompute }) {
  const [result, setResult] = useState<{ source: string; html: string; error?: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    mathStyles ??= import('katex/dist/katex.min.css')
    void Promise.all([mathStyles, compute.math(source, true, revision, controller.signal)]).then(([, value]) => {
      if (!controller.signal.aborted) setResult({ source, ...value })
    }).catch(error => { if (!controller.signal.aborted && error?.name !== 'AbortError') setResult({ source, html: '', error: '公式渲染失败' }) })
    return () => controller.abort()
  }, [source, revision, compute, attempt])
  if (result?.source !== source) return <span aria-busy="true">{source}</span>
  if (result.error) return <span className="native-math-error">{source}<button type="button" onClick={() => setAttempt(value => value + 1)}>重试公式</button></span>
  // biome-ignore lint/security/noDangerouslySetInnerHtml: Only the locked KaTeX worker produces this markup, with trust:false; document HTML is isolated in a sandbox.
  return <span className="native-math" data-formula-ready="true" dangerouslySetInnerHTML={{ __html: result.html }} />
}
export interface PageRenderProps {
  document: ArtifactDocument
  page: ArtifactPage
  compute: NativeCompute
  editingId?: string | null
  onTextChange?(nodeId: string, value: ArtifactRichText, text: string): void
  onFinishText?(): void
  onCellChange?(nodeId: string, row: number, column: number, text: string): void
  presenting?: boolean
  onFlowSize?(pageId: string, height: number): void
  visibleNodeIds?: ReadonlySet<string>
  contentBottom?: number
  canvasOnly?: boolean
  pageVersion?:string
  revisionSeq?:string
  cropEditingId?: string | null
}
function TableCell({ value, editing, onCommit }: { value: string; editing: boolean; onCommit(value: string): void }) {
  const root = useRef<HTMLTableCellElement>(null)
  const [rendered, setRendered] = useState(value)
  const focused = useRef(false), dirty = useRef(false), composing = useRef(false), flushAfterComposition = useRef(false)
  const draft = useRef(value), baseline = useRef(value)
  const latest = useRef({ value, onCommit }); latest.current = { value, onCommit }
  const save = () => {
    if (composing.current) { flushAfterComposition.current = true; return }
    if (dirty.current && draft.current !== baseline.current) latest.current.onCommit(draft.current)
    baseline.current = draft.current; dirty.current = false; markDirty(false)
  }
  const markDirty = useLocalDraft(save)
  useEffect(() => {
    if (!focused.current) { baseline.current = value; draft.current = value; setRendered(value); if (root.current) root.current.textContent = value; dirty.current = false; markDirty(false) }
  }, [value, markDirty])
  const input = () => { draft.current = root.current?.textContent ?? ''; dirty.current = draft.current !== baseline.current; markDirty(dirty.current || composing.current) }
  return <td ref={root} contentEditable={editing} suppressContentEditableWarning onFocus={() => { focused.current = true }} onInput={input}
    onCompositionStart={() => { composing.current = true; markDirty(true) }} onCompositionEnd={() => { composing.current = false; input(); if (flushAfterComposition.current) { flushAfterComposition.current = false; queueMicrotask(save) } }}
    onPaste={event => { event.preventDefault(); window.document.execCommand('insertText', false, event.clipboardData.getData('text/plain')) }}
    onPointerDown={event => { if (editing) event.stopPropagation() }} onBlur={() => { focused.current = false; save(); if (!composing.current) { setRendered(latest.current.value); if (root.current) root.current.textContent = latest.current.value } }}>{rendered}</td>
}
function NodeContent({ node, document, page, compute, pageVersion, revisionSeq, editingId, cropEditingId, onTextChange, onFinishText, onCellChange, presenting }: PageRenderProps & { node: ArtifactNode }) {
  node = { ...node, ...(cropEditingId===node.id ? {crop:undefined} : {}), style: artifactResolvedStyle(node.style, document) }
  const gradient = node.style.gradient
  const fill = gradient ? `url(#native-gradient-${node.id})` : node.style.fill ?? '#d6e6ff'
  switch (node.type) {
    case 'note':
    case 'text': return editingId === node.id && onTextChange ? <Suspense fallback={<span>{node.text}</span>}><RichTextEditor value={node.richText} text={node.text ?? ''} onChange={(value, text) => onTextChange(node.id, value, text)} onFinish={() => onFinishText?.()} /></Suspense> : <div className="native-text-content">{node.richText ? richTextContent(node.richText) : node.text}</div>
    case 'math': return <MathContent source={node.source ?? ''} revision={document.seq} compute={compute} />
    case 'video': {
      const asset = node.assetId ? document.assets[node.assetId] : undefined
      const crop=node.crop??{x:0,y:0,width:1,height:1}
      return asset ? <div className="native-image-crop"><AssetVideo asset={asset} documentId={document.id} presenting={presenting} style={{width:`${100/Math.max(.01,crop.width)}%`,height:`${100/Math.max(.01,crop.height)}%`,maxWidth:'none',transform:`translate(${-crop.x*100}%,${-crop.y*100}%)`}} /></div> : null
    }
    case 'image': {
      const asset = node.assetId ? document.assets[node.assetId] : undefined
      const crop = node.crop ?? { x: 0, y: 0, width: 1, height: 1 }
      return asset ? <div className="native-image-crop"><AssetImage asset={asset} artifactId={document.id} alt={node.text ?? ''} style={{ width: `${100 / Math.max(.01, crop.width)}%`, height: `${100 / Math.max(.01, crop.height)}%`, maxWidth: 'none', transform: `translate(${-crop.x * 100}%,${-crop.y * 100}%)`, objectFit: 'cover' }} /></div> : <span role="img" aria-label="图片资源缺失">图片资源缺失</span>
    }
    case 'svg': return <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(node.svg ?? '')}`} alt={node.text ?? '图形'} draggable={false} className="native-svg-image" />
    case 'shape': return <svg viewBox={`0 0 ${node.width} ${node.height}`} width="100%" height="100%" aria-label="形状" style={{ overflow: 'visible' }}>
      {gradient && <defs>{gradient.type === 'radial' ? <radialGradient id={`native-gradient-${node.id}`}>{gradient.stops.map((stop,index) => <stop key={index} offset={stop.offset} stopColor={stop.color} />)}</radialGradient> : <linearGradient id={`native-gradient-${node.id}`} x1="0%" y1="0%" x2="100%" y2="0%" gradientTransform={`rotate(${gradient.angle-90} .5 .5)`}>{gradient.stops.map((stop,index) => <stop key={index} offset={stop.offset} stopColor={stop.color} />)}</linearGradient>}</defs>}
      {(() => { const {tag: Shape,attributes}=artifactShapeGeometry(node.shape,node.width,node.height,node.style.borderRadius);return <Shape {...attributes} fill={fill} stroke={node.style.stroke} strokeWidth={node.style.strokeWidth} /> })()}
    </svg>
    case 'drawing':
    case 'line': return <svg width="100%" height="100%" viewBox={`0 0 ${node.width} ${node.height}`} style={{ overflow: 'visible' }}><defs><marker id={`arrow-${node.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill={node.style.stroke ?? '#333'} /></marker></defs><polyline points={(node.points ?? [{ x: 0, y: node.height / 2 }, { x: node.width, y: node.height / 2 }]).map(point => `${point.x},${point.y}`).join(' ')} stroke={node.style.stroke ?? '#333'} strokeWidth={node.style.strokeWidth ?? 3} fill="none" markerEnd={node.lineEnd === 'none' || node.type === 'drawing' ? undefined : `url(#arrow-${node.id})`} markerStart={node.lineStart === 'arrow' ? `url(#arrow-${node.id})` : undefined} /></svg>
    case 'table': return <table className="native-table"><tbody>{node.cells?.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, colIndex) => <TableCell key={colIndex} value={cell} editing={editingId === node.id && !!onCellChange} onCommit={text => onCellChange?.(node.id, rowIndex, colIndex, text)} />)}</tr>)}</tbody></table>
    case 'embed': return node.embed?.sourceHash ? <IsolatedEmbed pageVersion={pageVersion} revisionSeq={revisionSeq} documentId={document.id} pageId={page.id} node={node} presenting={presenting} /> : <div className="native-embed-wait">隔离内容等待保存</div>
    case 'group': return null
  }
}
export const PageContent = memo(function PageContent(props: PageRenderProps) {
  const { page, document } = props
  const root = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (page.sizing !== 'flow' || !root.current || !props.onFlowSize) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const measure = () => { clearTimeout(timer); timer = setTimeout(() => {
      const element = root.current
      if (!element?.isConnected) return
      const bounds = element.getBoundingClientRect(), scale = bounds.width / page.width
      if (!scale) return
      let bottom = props.contentBottom ?? page.height
      for (const child of element.querySelectorAll<HTMLElement>('.native-node')) {
        const box = child.getBoundingClientRect()
        bottom = Math.max(bottom, (box.bottom - bounds.top) / scale, (box.top - bounds.top) / scale + child.scrollHeight)
      }
      const height = Math.min(8000, Math.max(40, Math.ceil(bottom)))
      if (Math.abs(height - page.height) > 1) props.onFlowSize?.(page.id, height)
    }, 120) }
    const observer = new ResizeObserver(measure)
    observer.observe(root.current)
    for (const child of root.current.querySelectorAll('.native-node')) observer.observe(child)
    measure()
    return () => { observer.disconnect(); clearTimeout(timer) }
  }, [page, props.onFlowSize, props.visibleNodeIds, props.contentBottom])
  const children = new Map<string | null, ArtifactNode[]>()
  for (const id of page.nodeOrder) { const node = page.nodes[id]; if (!node || node.hidden || (node.parentId === null && (node.scope === 'canvas') !== !!props.canvasOnly) || (props.visibleNodeIds && !props.visibleNodeIds.has(id))) continue; const group = children.get(node.parentId) ?? []; group.push(node); children.set(node.parentId, group) }
  const render = (node: ArtifactNode, flow: boolean): ReactNode => <div key={node.id} className={`native-node native-node-${node.type}`} data-node-id={node.id} data-node-type={node.type} style={{ ...nativeStyle(node.style, document), position: flow ? 'relative' : 'absolute', left: flow ? undefined : node.x, top: flow ? undefined : node.y, width: node.width, height: page.sizing === 'flow' && node.type === 'group' && node.layout?.mode !== 'absolute' ? 'auto' : node.height, minHeight: page.sizing === 'flow' && node.type === 'group' ? node.height : undefined, transform: nodeTransform(node), transformOrigin: 'center', boxSizing: 'border-box', ...(node.type === 'group' && node.layout?.mode !== 'absolute' ? { display: node.layout?.mode, flexDirection: node.layout?.direction, gap: node.layout?.gap, alignItems: node.layout?.align, justifyContent: node.layout?.justify, gridTemplateColumns: node.layout?.mode === 'grid' ? `repeat(${node.layout.columns ?? 1},minmax(0,1fr))` : undefined } : {}), ...(node.type === 'shape' || node.type === 'line' || node.type === 'drawing' ? { backgroundColor: undefined, backgroundImage: undefined, border: undefined } : {}) }}>
    <NodeContent {...props} node={node} />{children.get(node.id)?.map(child => render(child, node.layout?.mode === 'flex' || node.layout?.mode === 'grid'))}
  </div>
  return <div ref={root} className={`native-page-content ${props.canvasOnly ? 'native-canvas-content' : ''}`} data-content-layer style={{ width: page.width, height: page.height, background: props.canvasOnly ? 'transparent' : artifactPageBackground(page, document) }}>{children.get(null)?.map(node => render(node, false))}</div>
})
