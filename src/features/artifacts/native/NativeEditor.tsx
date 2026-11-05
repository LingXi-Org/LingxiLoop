import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { http } from '@/api/core/http'
import { ws } from '@/api/core/realtime'
import { createNode, createPage, type ArtifactAsset, type ArtifactDocument, type ArtifactNode, type ArtifactNodeType, type ArtifactPage, type ArtifactRichText } from '../../../../shared/artifact-document'
import type { ArtifactOperation } from '../../../../shared/artifact-operations'
import { artifactPageBackground, artifactResolvedStyle } from '../../../../shared/artifact-themes'
import { resizeFlowManifest } from '../../../../shared/design-flow-size'
import type { SlideEditorContext } from '../../../../shared/slides-editor-context'
import { NativeCompute } from './compute'
import { NativeDocumentSession } from './session'
import { nativeTransport } from './transport'
import { fetchArtifactAsset } from './assets'
import { PageContent } from './renderer'
import { useVisibleElements } from './use-visibility'
import { NativeDrafts } from './drafts'
import { DraftContext, useLocalDraft } from './draft-context'
import type { ThemeTokens } from './compute'
import { IconButton, Menu, MenuItem, Modal, EditorIcon } from './EditorPrimitives'
import { PageThumbnail } from './thumbnail'
import { PageRail } from './PageRail'
import { duplicatePages, distributeNodes, resizeSelection, drawingNode, layoutSlide, SLIDE_LAYOUTS, type ResizeHandle } from '../../../../shared/artifact-editor-actions'
import { decodeCommentAnchor, commentPoint, type NativeCommentAnchor } from '../../../../shared/artifact-comment-anchor'
import type { EditorComment } from './CommentsPanel'
import type { ArtifactExportFormat } from './export-artifact'
import './native-editor.css'
const CommentsPanel = lazy(() => import('./CommentsPanel'))
const CropEditor = lazy(() => import('./CropEditor'))

const id = () => crypto.randomUUID()
function download(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30_000) }
function Field({ label, value, onChange, type = 'text', min, max }: { label: string; value: string | number; onChange(value: string): void; type?: string; min?: number; max?: number }) {
  const [draft, setDraft] = useState(String(value))
  const focused = useRef(false), dirty = useRef(false), composing = useRef(false), flushAfterComposition = useRef(false)
  const latest = useRef({ draft, value: String(value), onChange }); latest.current = { draft, value: String(value), onChange }
  const save = () => {
    if (composing.current) { flushAfterComposition.current = true; return }
    if (dirty.current && latest.current.draft !== latest.current.value) latest.current.onChange(latest.current.draft)
    dirty.current = false; markDirty(false)
  }
  const markDirty = useLocalDraft(save)
  useEffect(() => { if (!focused.current) { setDraft(String(value)); latest.current.draft = String(value); dirty.current = false; markDirty(false) } }, [value, markDirty])
  const change = (value: string) => { latest.current.draft = value; setDraft(value); dirty.current = value !== latest.current.value; markDirty(dirty.current || composing.current) }
  return <label className="native-field"><span>{label}</span><input type={type} min={min} max={max} value={draft} onFocus={() => { focused.current = true }} onChange={event => change(event.target.value)} onCompositionStart={() => { composing.current = true; markDirty(true) }} onCompositionEnd={event => { composing.current = false; change(event.currentTarget.value); if (flushAfterComposition.current) { flushAfterComposition.current = false; queueMicrotask(save) } }} onBlur={() => { focused.current = false; save(); if (!composing.current) setDraft(latest.current.value) }} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.currentTarget.blur() }} /></label>
}
function TextAreaField({ value, label, placeholder, disabled, onFocus, onCommit }: { value: string; label: string; placeholder?: string; disabled?: boolean; onFocus?(): void; onCommit(value: string): void }) {
  const [draft, setDraft] = useState(value)
  const focused = useRef(false), dirty = useRef(false), composing = useRef(false), flushAfterComposition = useRef(false)
  const latest = useRef({ draft, value, onCommit }); latest.current = { draft, value, onCommit }
  const save = () => {
    if (composing.current) { flushAfterComposition.current = true; return }
    if (dirty.current && latest.current.draft !== latest.current.value) latest.current.onCommit(latest.current.draft)
    dirty.current = false; markDirty(false)
  }
  const markDirty = useLocalDraft(save)
  useEffect(() => { if (!focused.current) { setDraft(value); latest.current.draft = value; dirty.current = false; markDirty(false) } }, [value, markDirty])
  const change = (value: string) => { latest.current.draft = value; setDraft(value); dirty.current = value !== latest.current.value; markDirty(dirty.current || composing.current) }
  return <textarea aria-label={label} placeholder={placeholder} disabled={disabled} value={draft} onFocus={() => { focused.current = true; onFocus?.() }} onChange={event => change(event.target.value)} onCompositionStart={() => { composing.current = true; markDirty(true) }} onCompositionEnd={event => { composing.current = false; change(event.currentTarget.value); if (flushAfterComposition.current) { flushAfterComposition.current = false; queueMicrotask(save) } }} onBlur={() => { focused.current = false; save(); if (!composing.current) setDraft(latest.current.value) }} />
}
interface Gesture { base: ArtifactDocument; type: 'move' | 'resize' | 'marquee' | 'pan' | 'draw' | 'rotate'; startX: number; startY: number; pageId: string; nodes: ArtifactNode[]; moved: boolean; handle?: ResizeHandle; points?: Array<{ x: number; y: number }>; tool?: string; angle?: number; scrollX?: number; scrollY?: number }
interface Props { artifactId: string; kind: 'design' | 'slides'; title: string; visible?: boolean; agentWorking?: boolean; exitPresentation?: number; onEditorContext?(context: SlideEditorContext): void }
export default function NativeEditor({ artifactId, kind, title, visible = true, agentWorking = false, exitPresentation = 0, onEditorContext }: Props) {
  const session = useMemo(() => new NativeDocumentSession(nativeTransport(artifactId)), [artifactId])
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const drafts = useMemo(() => new NativeDrafts(), [artifactId])
  const draftCount = useSyncExternalStore(drafts.subscribe, drafts.getSnapshot)
  const flushText = useCallback(() => drafts.flush(), [drafts])
  const doc = state.document
  const compute = useMemo(() => new NativeCompute(), [artifactId])
  const [authorized, setAuthorized] = useState(false)
  const [pageId, setPageId] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [presenting, setPresenting] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [viewport, setViewport] = useState({ width: 800, height: 600, x: 0, y: 0 })
  const [visibleBoards, setVisibleBoards] = useState<string[]>([])
  const [preview, setPreview] = useState<{ dx: number; dy: number; resize?: boolean } | null>(null)
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [exporting, setExporting] = useState('')
  const [notice, setNotice] = useState('')
  const [inspectorTab, setInspectorTab] = useState<'properties'|'theme'>('properties')
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [resolvedTheme, setResolvedTheme] = useState<{ source: ThemeTokens; tokens: ThemeTokens } | null>(null)
  const [tool, setTool] = useState('select')
  const [shapeTool, setShapeTool] = useState<ArtifactNode['shape']>('rect')
  const [view, setView] = useState<'slide' | 'grid' | 'canvas'>('slide')
  const [railOpen, setRailOpen] = useState(true), [notesOpen, setNotesOpen] = useState(false)
  const [layersOpen, setLayersOpen] = useState(false), [guidesOpen, setGuidesOpen] = useState(true)
  const [selectedPages, setSelectedPages] = useState<string[]>([])
  const [dialog, setDialog] = useState<'layouts' | 'section' | 'rename' | null>(null), [dialogText, setDialogText] = useState('')
  const [commentsOpen, setCommentsOpen] = useState(false), [commentAnchor, setCommentAnchor] = useState<NativeCommentAnchor | null>(null)
  const [commentThreads, setCommentThreads] = useState<EditorComment[]>([])
  const [cropping, setCropping] = useState<ArtifactNode | null>(null)
  const [contextMenu, setContextMenu] = useState<{x:number;y:number}|null>(null)
  const [drawingPreview, setDrawingPreview] = useState<Array<{ x: number; y: number }> | null>(null)
  const canvasMode = (kind === 'design' || view === 'canvas') && !presenting
  const editorRoot = useRef<HTMLElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const replaceImage = useRef(false)
  const gesture = useRef<Gesture | null>(null)
  const space = useRef(false)
  const exportingAbort = useRef<AbortController | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const clipboard = useRef<ArtifactNode[]>([])
  const notesBase = useRef<ArtifactDocument | null>(null)
  const inspectorBase = useRef<ArtifactDocument | null>(null)
  const textBase = useRef<ArtifactDocument | null>(null)
  const textPage = useRef<string | null>(null)
  const lifetime = useRef<object | null>(null)
  const initialCamera = useRef(false)
  const geometry = useRef(new Map<string, string>())
  const current = doc && pageId ? doc.pages[pageId] : undefined
  const selectedNodes = current ? selected.flatMap(value => current.nodes[value] ? [current.nodes[value]] : []) : []
  const primary = selectedNodes.length === 1 ? selectedNodes[0] : undefined
  const writable = state.write && !state.conflict && !presenting && (!current || state.loadedPageIds.includes(current.id))
  const currentRef = useRef(current); currentRef.current = current
  const selectedRef = useRef(selected); selectedRef.current = selected
  const dispatch = useCallback((ops: ArtifactOperation[], base?: ArtifactDocument) => { try { session.dispatch(ops, base) } catch (error) { setNotice(error instanceof Error ? error.message : '无法应用修改') } }, [session])
  useEffect(() => { const token = {}; lifetime.current = token; return () => { queueMicrotask(() => { if (lifetime.current === token) { session.dispose(); compute.dispose(); exportingAbort.current?.abort() } }) } }, [session, compute])
  useLayoutEffect(() => { let active = true; setAuthorized(false); if (visible) void session.open().then(() => { if (active) setAuthorized(!!session.getSnapshot().document) }); return () => { active = false } }, [session, visible])
  useEffect(() => { if (!visible) return; const timer = setInterval(() => void session.refresh(), agentWorking ? 700 : 2000); return () => clearInterval(timer) }, [session, visible, agentWorking])
  useEffect(() => ws.on(event => { if (event.type === 'artifact.changed' && event.artifactId === artifactId) void session.refresh() }), [session, artifactId])
  useEffect(() => { if (!doc) return; if (!pageId || !doc.pages[pageId]) { setPageId(doc.pageOrder[0] ?? null); setSelected([]); setEditingId(null) } }, [doc, pageId])
  useEffect(() => { if (!state.pending && !draftCount) return; const warn = (event: BeforeUnloadEvent) => { flushText(); event.preventDefault(); event.returnValue = '' }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn) }, [state.pending, draftCount, flushText])
  useEffect(() => { if (presenting) editorRoot.current?.focus({ preventScroll: true }) }, [presenting])
  useEffect(() => { if (exitPresentation) setPresenting(false) }, [exitPresentation])
  useLayoutEffect(() => {
    if (!viewportRef.current) return
    const measure = () => { const element = viewportRef.current; if (element) setViewport({ width: element.clientWidth, height: element.clientHeight, x: element.scrollLeft, y: element.scrollTop }) }
    const observer = new ResizeObserver(measure); observer.observe(viewportRef.current); measure(); return () => observer.disconnect()
  }, [doc !== null, presenting, authorized])
  const scale = !canvasMode && current ? Math.max(.05, Math.min((viewport.width - (presenting ? 0 : 48)) / current.width, (viewport.height - (presenting ? 0 : 104)) / current.height)) * zoom : zoom * .5
  useEffect(() => {
    if (initialCamera.current || !authorized || !doc?.pageOrder.length || !viewport.width || !viewport.height) return
    initialCamera.current = true
    if (kind === 'design') {
      const pages=doc.pageOrder.map(id=>doc.pages[id]), minX=Math.min(0,...pages.map(p=>p.x)), minY=Math.min(0,...pages.map(p=>p.y))
      const width=Math.max(...pages.map(p=>p.x+p.width))-minX, height=Math.max(...pages.map(p=>p.y+p.height))-minY
      setZoom(Math.max(.04,Math.min(4,Math.min((viewport.width-128)/(width+128),(viewport.height-140)/(height+128))*2)))
    }
  },[authorized,doc,viewport.width,viewport.height,kind])
  const displayPages = useMemo(()=>doc ? Object.fromEntries(doc.pageOrder.map((id,index)=>{const p=doc.pages[id];return [id,kind==='slides' && canvasMode ? {...p,x:index%4*(p.width+80),y:Math.floor(index/4)*(p.height+100)} : p]})) : {},[doc,kind,canvasMode])
  const origin = useMemo(() => ({ x: doc ? Math.min(0, ...doc.pageOrder.map(value => displayPages[value].x)) : 0, y: doc ? Math.min(0, ...doc.pageOrder.map(value => displayPages[value].y)) : 0 }), [doc?.pageOrder, displayPages])
  const canvasExtent = useMemo(()=>({width:doc ? Math.max(0,...doc.pageOrder.map(id=>displayPages[id].x-origin.x+displayPages[id].width+128))*scale : 0,height:doc ? Math.max(0,...doc.pageOrder.map(id=>displayPages[id].y-origin.y+displayPages[id].height+128))*scale : 0}),[doc,displayPages,origin,scale])
  const canvasInset = {x:Math.max(0,(viewport.width-canvasExtent.width)/2),y:54+Math.max(0,(viewport.height-54-canvasExtent.height)/2)}
  useEffect(() => {
    if (!doc) return
    const upserts = doc.pageOrder.flatMap(value => { const p = displayPages[value]; const hash = `${p.x},${p.y},${p.width},${p.height}`; if (geometry.current.get(value) === hash) return []; geometry.current.set(value, hash); return [{ id: value, x: p.x, y: p.y, width: p.width, height: p.height }] })
    const removed = [...geometry.current.keys()].filter(value => !doc.pages[value]); for (const value of removed) geometry.current.delete(value)
    const controller = new AbortController()
    void compute.updatePages(upserts, removed, doc.seq).then(() => {
      if (!canvasMode) return
      return compute.visible({ x: (viewport.x-canvasInset.x) / scale + origin.x - 64, y: (viewport.y-canvasInset.y) / scale + origin.y - 64, width: viewport.width / scale + 128, height: viewport.height / scale + 128 }, doc.seq, controller.signal).then(setVisibleBoards)
    }).catch(error => { if (error?.name !== 'AbortError') setNotice('画板计算暂时不可用，请重试。') })
    return () => controller.abort()
  }, [doc, displayPages, canvasMode, viewport, scale, origin, compute, canvasInset.x, canvasInset.y])
  const boards = useMemo(() => {
    if (!doc || !visible || !authorized) return []
    if (!canvasMode) return current ? [current] : []
    const ids = new Set(visibleBoards); if (editingId && current) ids.add(current.id)
    return [...ids].flatMap(value => displayPages[value] ? [displayPages[value]] : [])
  }, [doc, displayPages, visible, authorized, canvasMode, current, visibleBoards, editingId])
  const detailedBoards = useMemo(() => canvasMode && scale < .15 ? boards.filter(p=>p.id===pageId||!!editingId&&p.nodes[editingId]) : boards,[boards,canvasMode,scale,pageId,editingId])
  const visibleElements = useVisibleElements({ pages: detailedBoards, revision: doc?.seq ?? 0, viewport, scale, root: viewportRef, compute, pageId, selected, editingId, onError: setNotice })
  const themeTokens = doc?.themeId ? doc.themes[doc.themeId]?.tokens : undefined
  useEffect(() => {
    if (!themeTokens || !doc) return
    const controller = new AbortController()
    void compute.resolveTheme(themeTokens, doc.seq, controller.signal).then(result => { if (!controller.signal.aborted) { setResolvedTheme({ source: themeTokens, tokens: result.tokens }); if (result.issues.length) setNotice('主题包含无法解析的引用，部分元素使用默认样式。') } }).catch(error => { if (error?.name !== 'AbortError') setNotice('主题计算暂时不可用。') })
    return () => controller.abort()
  }, [compute, themeTokens, doc?.seq])
  const renderDocument = useMemo(() => doc && doc.themeId && resolvedTheme && resolvedTheme.source === themeTokens ? { ...doc, themes: { ...doc.themes, [doc.themeId]: { ...doc.themes[doc.themeId], tokens: resolvedTheme.tokens } } } : doc, [doc, resolvedTheme, themeTokens])
  const selectPage = useCallback((value: string) => { flushText(); setEditingId(null); setCropping(null); setSelected([]); setPageId(value); if (canvasMode && doc?.pages[value] && viewportRef.current) { const p = displayPages[value]; viewportRef.current.scrollTo({ left: Math.max(0, (p.x - origin.x) * scale), top: Math.max(0, (p.y - origin.y) * scale), behavior: 'instant' }) } }, [doc, displayPages, canvasMode, origin, scale, flushText])
  useEffect(() => { if (current) void session.ensurePage(current.id); if (scale >= .15) for (const value of visibleBoards) void session.ensurePage(value) }, [current?.id, visibleBoards, session, state.loadedPageIds, scale])
  useEffect(() => { if (!contextMenu) return; const close = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setContextMenu(null) }; window.addEventListener('pointerdown',close); return () => window.removeEventListener('pointerdown',close) },[contextMenu])
  const contextCallback = useRef(onEditorContext); contextCallback.current = onEditorContext
  useEffect(() => {
    if (!visible || !doc) return
    const context: SlideEditorContext = { slideId: current?.id ?? null, selectedElementIds: selected, selectedText: selectedNodes.map(node => node.text ?? node.source ?? '').join('\n').slice(0, 16000), selection: selectedNodes.map(node => ({ id: node.id, kind: node.type, label: (node.text ?? node.source ?? node.type).slice(0, 2000) })), slideTitle: current?.title ?? '', slideIndex: current ? doc.pageOrder.indexOf(current.id) + 1 : 0, slideCount: doc.pageOrder.length, selectedSlides: selectedPages.length ? selectedPages : current ? [current.id] : [], mode: presenting ? 'present' : 'edit', dirty: state.pending > 0 || draftCount > 0, version: String(doc.seq) }
    if (contextCallback.current) contextCallback.current(context)
    else { const controller = new AbortController(); void http(`/artifacts/${encodeURIComponent(artifactId)}/editor-context`, { method: 'PUT', body: JSON.stringify(context), signal: controller.signal }).catch(() => { if (!controller.signal.aborted) setNotice('编辑上下文尚未同步，请稍后再发送。') }); return () => controller.abort() }
  }, [doc, current, selected, selectedPages, state.pending, draftCount, presenting, visible, artifactId])
  const inspectDispatch = useCallback((operations: ArtifactOperation[]) => { try { session.dispatch(operations, inspectorBase.current ?? undefined); inspectorBase.current = session.getSnapshot().document } catch { setNotice('此属性已有新修改，未覆盖。本地修改保留在恢复副本中。') } }, [session])
  const patchNode = useCallback((patch: Partial<ArtifactNode>, unset?: string[]) => { if (!currentRef.current) return; inspectDispatch(selectedRef.current.map(nodeId => ({ type: 'node.patch', pageId: currentRef.current!.id, nodeId, patch, ...(unset?.length ? { unset } : {}) }))) }, [inspectDispatch])
  const changeText = useCallback((nodeId: string, richText: ArtifactRichText, text: string) => { const page = textPage.current ? textBase.current?.pages[textPage.current] : currentRef.current; if (page && page.nodes[nodeId]) { try { session.dispatch([{ type: 'node.patch', pageId: page.id, nodeId, patch: { richText, text } }], textBase.current ?? undefined); textBase.current = session.getSnapshot().document } catch { setNotice('此文本已有其他修改，未覆盖。请复制当前文字后重新打开文本。') } } }, [session])
  const finishText = useCallback(() => setEditingId(null), [])
  const changeCell = useCallback((nodeId: string, row: number, column: number, text: string) => { const p = textPage.current ? textBase.current?.pages[textPage.current] : currentRef.current; const node = p?.nodes[nodeId]; if (!p || !node?.cells) return; const cells = node.cells.map(items => [...items]); cells[row][column] = text; dispatch([{ type: 'node.patch', pageId: p.id, nodeId, patch: { cells } }], textBase.current ?? undefined); textBase.current = session.getSnapshot().document }, [dispatch, session])
  const flowSize = useCallback((id: string, height: number) => {
    const snapshot = session.getSnapshot()
    if (!snapshot.document || !snapshot.write || snapshot.conflict) return
    const document = snapshot.document, page = document.pages[id]
    if (!page || page.sizing !== 'flow' || Math.abs(page.height - height) <= 1) return
    const manifest = { artboards: document.pageOrder.map(value => { const p = document.pages[value]; return { file: p.id, x: p.x, y: p.y, w: p.width, h: p.height } }) }
    const next = resizeFlowManifest(manifest, id, { w: page.width, h: height }, item => item)
    if (next === manifest) return
    dispatch(next.artboards.flatMap(board => { const p = document.pages[board.file]; return p.height !== board.h || p.y !== board.y ? [{ type: 'page.patch' as const, pageId: p.id, patch: { height: board.h, y: board.y } }] : [] }))
  }, [session, dispatch])
  const addPage = () => { if (!doc) return; const page = createPage(id(), `${kind === 'slides' ? '页面' : '画板'} ${doc.pageOrder.length + 1}`); if (kind === 'design') { page.x = (doc.pageOrder.length % 4) * (page.width + 80); page.y = Math.floor(doc.pageOrder.length / 4) * (page.height + 100) } dispatch([{ type: 'page.insert', page }]); setPageId(page.id); setSelected([]) }
  const addNode = (type: ArtifactNodeType, extra: Partial<ArtifactNode> = {}) => { if (!current) return; const node = { ...createNode(type, id()), ...extra }; dispatch([{ type: 'node.insert', pageId: current.id, node }]); setSelected([node.id]); textBase.current = session.getSnapshot().document; textPage.current = current.id; setEditingId(type === 'text' ? node.id : null) }
  async function uploadImage(file: File) {
    if (!current || !writable) return
    if (!/^(image\/(png|jpeg|webp|gif|avif|svg\+xml)|video\/(mp4|webm|ogg))$/.test(file.type)) { setNotice('请选择图片或 MP4、WebM、Ogg 视频。'); return }
    if (file.size > 20 * 1024 * 1024) { setNotice('文件大小不能超过 20 MB。'); return }
    const target = replaceImage.current && (primary?.type === 'image' || primary?.type === 'video') ? primary : null; if (target && (target.type === 'video') !== file.type.startsWith('video/')) { replaceImage.current = false; setNotice('请选择与原素材相同类型的文件。'); return } replaceImage.current = false; const base = session.getSnapshot().document!
    try { const asset = await http<ArtifactAsset>(`/artifacts/${encodeURIComponent(artifactId)}/assets?name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file, headers: { 'content-type': file.type } }); const mediaOps: ArtifactOperation[] = [{type:'asset.set',asset}]; let posterAssetId: string | undefined
      if (file.type.startsWith('video/')) { const {videoPoster} = await import('./media'); const poster = await videoPoster(file); const preview = await http<ArtifactAsset>(`/artifacts/${encodeURIComponent(artifactId)}/assets`,{method:'POST',body:poster,headers:{'content-type':'image/png'}}); mediaOps.push({type:'asset.set',asset:preview}); posterAssetId=preview.id }
      const node = { ...createNode(file.type.startsWith('video/') ? 'video' : 'image', id()), assetId: asset.id, text: file.name, ...(posterAssetId ? {posterAssetId} : {}) }; if (target) { session.dispatch([...mediaOps, { type: 'node.patch', pageId: current.id, nodeId: target.id, patch: { assetId: asset.id, text: file.name, ...(posterAssetId ? {posterAssetId} : {}) }, unset: ['crop'] }], base); setSelected([target.id]) } else { dispatch([...mediaOps, { type: 'node.insert', pageId: current.id, node }]); setSelected([node.id]) } } catch { setNotice('图片尚未上传，请重试。') }
  }
  const deleteSelection = () => { if (current && writable) { flushText(); setEditingId(null); dispatch(selected.filter(nodeId => { let parent = current.nodes[nodeId]?.parentId; while(parent) { if(selected.includes(parent)) return false; parent=current.nodes[parent]?.parentId } return true }).map(nodeId => ({ type: 'node.delete', pageId: current.id, nodeId }))); setSelected([]) } }
  const selectedWithChildren = () => {
    if (!current) return []
    const ids = new Set(selected)
    for (let changed = true; changed;) { changed = false; for (const node of Object.values(current.nodes)) if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) { ids.add(node.id); changed = true } }
    return current.nodeOrder.filter(value => ids.has(value)).map(value => current.nodes[value])
  }
  const copySelection = () => { clipboard.current = selectedWithChildren().map(node => structuredClone(node)) }
  const pasteNodes = (nodes: ArtifactNode[]) => {
    if (!current || !writable) return
    const mapping = new Map(nodes.map(node => [node.id, id()]))
    const copies = nodes.map(node => ({ ...structuredClone(node), id: mapping.get(node.id)!, x: node.x + (node.parentId && mapping.has(node.parentId) ? 0 : 24), y: node.y + (node.parentId && mapping.has(node.parentId) ? 0 : 24), parentId: node.parentId ? mapping.get(node.parentId) ?? null : null }))
    dispatch(copies.map(node => ({ type: 'node.insert', pageId: current.id, node }))); setSelected(copies.map(node => node.id))
  }
  const groupSelection = () => {
    if (!current || selectedNodes.length < 2 || selectedNodes.some(node => node.parentId)) return
    const x = Math.min(...selectedNodes.map(node => node.x)), y = Math.min(...selectedNodes.map(node => node.y))
    const group = { ...createNode('group', id()), scope: selectedNodes.every(n => n.scope === 'canvas') ? 'canvas' as const : 'artboard' as const, x, y, width: Math.max(...selectedNodes.map(node => node.x + node.width)) - x, height: Math.max(...selectedNodes.map(node => node.y + node.height)) - y, layout: { mode: 'absolute' as const } }
    dispatch([{ type: 'node.insert', pageId: current.id, node: group }, ...selectedNodes.map(node => ({ type: 'node.patch' as const, pageId: current.id, nodeId: node.id, patch: { parentId: group.id, x: node.x - x, y: node.y - y } }))]); setSelected([group.id])
  }
  const ungroup = () => { if (!current || primary?.type !== 'group') return; const children = current.nodeOrder.map(value => current.nodes[value]).filter(node => node.parentId === primary.id); dispatch([...children.map(node => ({ type: 'node.patch' as const, pageId: current.id, nodeId: node.id, patch: { parentId: primary.parentId, x: node.x + primary.x, y: node.y + primary.y } })), { type: 'node.delete', pageId: current.id, nodeId: primary.id }]); setSelected(children.map(node => node.id)) }
  const align = (direction: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    if (!current || !selectedNodes.length) return
    const bounds = selectedNodes.length === 1 ? { x: 0, y: 0, width: current.width, height: current.height } : { x: Math.min(...selectedNodes.map(node => node.x)), y: Math.min(...selectedNodes.map(node => node.y)), width: 0, height: 0 }
    if (selectedNodes.length > 1) { bounds.width = Math.max(...selectedNodes.map(node => node.x + node.width)) - bounds.x; bounds.height = Math.max(...selectedNodes.map(node => node.y + node.height)) - bounds.y }
    dispatch(selectedNodes.map(node => ({ type: 'node.patch', pageId: current.id, nodeId: node.id, patch: direction === 'left' ? { x: bounds.x } : direction === 'center' ? { x: bounds.x + (bounds.width - node.width) / 2 } : direction === 'right' ? { x: bounds.x + bounds.width - node.width } : direction === 'top' ? { y: bounds.y } : direction === 'middle' ? { y: bounds.y + (bounds.height - node.height) / 2 } : { y: bounds.y + bounds.height - node.height } })))
  }
  async function downloadSource() { try { const source = await http<unknown>(`/artifacts/${encodeURIComponent(artifactId)}/source`); download(new Blob([JSON.stringify(source)], { type: 'application/json' }), `${title}.lingxi-source.json`) } catch { setNotice('原始文件暂时无法下载，请重试。') } }
  async function doExport(format: ArtifactExportFormat) {
    flushText(); setEditingId(null); setNotice(''); const controller = new AbortController(); exportingAbort.current = controller; setExporting('正在准备导出')
    try { await session.flush(); const snapshot = await session.exportSnapshot(controller.signal); let document = snapshot.document; if (!document) return; if (['png', 'jpeg', 'svg'].includes(format) && current) document = { ...document, pageOrder: [current.id], pages: { [current.id]: document.pages[current.id] } }; { const { captureEmbedPreviews } = await import('./capture-embeds'); document = await captureEmbedPreviews(document, controller.signal, snapshot.pageVersions) } const { exportArtifact } = await import('./export-artifact'); const result = await exportArtifact(document, { format, resolveAsset: (asset, signal) => fetchArtifactAsset(asset, artifactId, signal), signal: controller.signal, onProgress: (done, total) => setExporting(`正在导出 ${done}/${total}`) }); if (!controller.signal.aborted) { download(result.blob, result.filename); setNotice(result.warnings.join('；')) } }
    catch (error) { if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : '导出失败，请重试。') }
    finally { exportingAbort.current = null; setExporting('') }
  }
  const navigatePresentation = (direction: number) => { if (!doc) return; const pages = doc.pageOrder.filter(value => !doc.pages[value].skip); const index = pages.indexOf(pageId ?? ''); if (pages[index + direction]) selectPage(pages[index + direction]) }
  function pointerDown(event: ReactPointerEvent, page: ArtifactPage, canvas = false) {
    if (presenting || event.button > 1) return
    if (tool === 'comment') { const target = (event.target as HTMLElement).closest<HTMLElement>('[data-node-id]'); const node = target ? page.nodes[target.dataset.nodeId ?? ''] : undefined; const rect = (target ?? event.currentTarget).getBoundingClientRect(); setPageId(page.id); setCommentAnchor({ pageId: page.id, ...(node ? { nodeId: node.id } : {}), x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) }); setInspectorOpen(false); setCommentsOpen(true); setTool('select'); event.preventDefault(); return }
    if (event.button === 1 || space.current || tool === 'hand') { event.preventDefault(); gesture.current = { base: session.getSnapshot().document!, type: 'pan', startX: event.clientX, startY: event.clientY, pageId: page.id, nodes: [], moved: false, scrollX: viewportRef.current?.scrollLeft, scrollY: viewportRef.current?.scrollTop }; event.currentTarget.setPointerCapture(event.pointerId); return }
    if (writable && ['text', 'note', 'pencil', 'pen', 'arrow', 'shape', 'frame'].includes(tool)) {
      const rect = event.currentTarget.getBoundingClientRect(), point = { x: (event.clientX - rect.left) / scale - (canvas ? page.x-origin.x+64+canvasInset.x/scale : 0), y: (event.clientY - rect.top) / scale - (canvas ? page.y-origin.y+64+canvasInset.y/scale : 0) }
      setPageId(page.id)
      if (['pencil', 'pen', 'arrow'].includes(tool)) {
        gesture.current = { base: session.getSnapshot().document!, type: 'draw', pageId: page.id, startX: event.clientX, startY: event.clientY, nodes: [], moved: false, points: [point], tool }; setDrawingPreview([point]); event.currentTarget.setPointerCapture(event.pointerId)
      } else if (tool === 'frame') addPage()
      else { const type = tool === 'note' ? 'note' : tool === 'shape' ? 'shape' : 'text'; const node = { ...createNode(type, id()), x: point.x, y: point.y, ...(canvas ? {scope: 'canvas' as const} : {}), ...(type === 'shape' ? { shape: shapeTool } : type === 'note' ? { text: '', width: 240, height: 200, style: { fill: '#fff3b0', color: '#141413', fontSize: 20, padding: 20 } } : {}) }; dispatch([{ type: 'node.insert', pageId: page.id, node }]); setSelected([node.id]); textBase.current = session.getSnapshot().document; textPage.current = page.id; setEditingId(type === 'text' || type === 'note' ? node.id : null); setTool('select') }
      event.preventDefault(); return
    }
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-node-id]')
    if ((event.target as HTMLElement).closest('button,input,textarea,[contenteditable="true"],.native-text-tools')) return
    flushText(); setEditingId(null); setPageId(page.id)
    const node = target ? page.nodes[target.dataset.nodeId ?? ''] : undefined
    let next = selected
    if (node) { next = event.shiftKey ? selected.includes(node.id) ? selected.filter(value => value !== node.id) : [...selected, node.id] : selected.includes(node.id) && current?.id === page.id ? selected : [node.id]; setSelected(next) }
    else { next = []; setSelected([]) }
    if (!writable) return
    const nodes = next.flatMap(value => page.nodes[value] && !page.nodes[value].locked ? [page.nodes[value]] : [])
    gesture.current = { base: session.getSnapshot().document!, type: node ? 'move' : 'marquee', startX: event.clientX, startY: event.clientY, pageId: page.id, nodes, moved: false }
    event.preventDefault()
  }
  function pointerMove(event: ReactPointerEvent) {
    event.stopPropagation()
    const active = gesture.current; if (!active) return
    const dx = (event.clientX - active.startX) / scale, dy = (event.clientY - active.startY) / scale
    if (Math.hypot(dx, dy) > 3) { active.moved = true; if (!event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId) }
    if (active.type === 'draw') { const start = active.points![0]; const p = { x: start.x + dx, y: start.y + dy }; active.points = active.tool === 'arrow' ? [start, p] : [...active.points!.slice(-1999), p]; setDrawingPreview(active.points); return }
    if (active.type === 'rotate') { const node = active.nodes[0]; const element = viewportRef.current?.querySelector<HTMLElement>(`[data-page-id="${active.pageId}"] [data-node-id="${node.id}"]`); if (element) { const r = element.getBoundingClientRect(); active.angle = node.rotation + (Math.atan2(event.clientY - (r.top+r.height/2), event.clientX - (r.left+r.width/2)) - Math.atan2(active.startY - (r.top+r.height/2), active.startX - (r.left+r.width/2))) * 180 / Math.PI; element.style.rotate = `${active.angle - node.rotation}deg` } return }
    if (active.type === 'pan') { viewportRef.current?.scrollTo((active.scrollX ?? 0) - (event.clientX - active.startX), (active.scrollY ?? 0) - (event.clientY - active.startY)); return }
    if (active.type === 'marquee') { const rect = (event.currentTarget as HTMLElement).getBoundingClientRect(); setMarquee({ x: (Math.min(active.startX, event.clientX) - rect.left) / scale, y: (Math.min(active.startY, event.clientY) - rect.top) / scale, width: Math.abs(dx), height: Math.abs(dy) }); return }
    setPreview({ dx, dy, resize: active.type === 'resize' })
    for (const node of active.nodes) { const element = viewportRef.current?.querySelector<HTMLElement>(`[data-page-id="${active.pageId}"] [data-node-id="${node.id}"]`); if (!element) continue; if (active.type === 'move') element.style.translate = `${dx}px ${dy}px`; else { element.style.width = `${Math.max(16, node.width + dx)}px`; element.style.height = `${Math.max(16, node.height + dy)}px` } }
  }
  function pointerUp(event: ReactPointerEvent, cancel = false) {
    event.stopPropagation()
    const active = gesture.current; if (!active) return
    gesture.current = null
    const dx = (event.clientX - active.startX) / scale, dy = (event.clientY - active.startY) / scale
    for (const node of active.nodes) { const element = viewportRef.current?.querySelector<HTMLElement>(`[data-page-id="${active.pageId}"] [data-node-id="${node.id}"]`); if (element) { element.style.translate = ''; element.style.width = `${node.width}px`; element.style.height = `${node.height}px` } }
    if (active.type === 'draw') { if (!cancel && active.points && active.points.length > 1) dispatch([{ type: 'node.insert', pageId: active.pageId, node: drawingNode(id(), active.points, active.tool as 'pencil' | 'pen' | 'arrow') }], active.base); setDrawingPreview(null); return }
    if (active.type === 'rotate') { const node = active.nodes[0]; const element = viewportRef.current?.querySelector<HTMLElement>(`[data-page-id="${active.pageId}"] [data-node-id="${node.id}"]`); if (element) element.style.rotate = ''; if (!cancel && active.angle !== undefined) dispatch([{ type: 'node.patch', pageId: active.pageId, nodeId: node.id, patch: { rotation: Math.round(active.angle) } }], active.base); return }
    if (!cancel && active.moved && active.type === 'marquee' && marquee && doc) { const page = doc.pages[active.pageId]; setSelected(page.nodeOrder.filter(value => { const n = page.nodes[value]; return !n.parentId && n.x >= marquee.x && n.y >= marquee.y && n.x + n.width <= marquee.x + marquee.width && n.y + n.height <= marquee.y + marquee.height })) }
    else if (!cancel && active.moved && (active.type === 'move' || active.type === 'resize')) dispatch(active.nodes.map(node => ({ type: 'node.patch', pageId: active.pageId, nodeId: node.id, patch: active.type === 'move' ? { x: Math.round(node.x + dx), y: Math.round(node.y + dy) } : ((({ x, y, width, height }) => ({ x, y, width, height }))(resizeSelection(active.nodes, active.handle ?? 'se', dx, dy).find(item => item.id === node.id)!)) })), active.base)
    setPreview(null); setMarquee(null)
  }
  const pageSelection = selectedPages.length ? selectedPages : current ? [current.id] : []
  const choosePage = (value: string, multiple = false, range = false) => {
    if (range && pageId && doc) { const a = doc.pageOrder.indexOf(pageId), b = doc.pageOrder.indexOf(value); setSelectedPages(doc.pageOrder.slice(Math.min(a, b), Math.max(a, b) + 1)) }
    else setSelectedPages(previous => multiple ? previous.includes(value) ? previous.filter(id => id !== value) : [...previous, value] : [value])
    selectPage(value)
  }
  const pageAction = async (action: 'duplicate' | 'delete' | 'skip' | 'section' | 'up' | 'down', target?: string) => {
    if (!doc || !writable) return
    const ids = target && !pageSelection.includes(target) ? [target] : pageSelection
    flushText()
    if (action === 'duplicate') { for (const value of ids) await session.ensurePage(value); const snapshot = session.getSnapshot().document; if (snapshot) dispatch(duplicatePages(snapshot, ids, id)) }
    if (action === 'delete') { dispatch(ids.map(pageId => ({ type: 'page.delete', pageId }))); setSelectedPages([]) }
    if (action === 'skip') dispatch(ids.map(pageId => ({ type: 'page.patch', pageId, patch: { skip: !doc.pages[pageId].skip } })))
    if ((action === 'up' || action === 'down') && ids.length) { const order=[...doc.pageOrder]; const index=order.indexOf(ids[0]), next=index+(action==='up'?-1:1); if(next>=0&&next<order.length) { [order[index],order[next]]=[order[next],order[index]]; dispatch([{type:'pages.reorder',pageIds:order}]) } }
    if (action === 'section') { setDialogText('新节'); setDialog('section') }
  }
  const fitViewport = () => {
    if (!doc) return
    if (!canvasMode) { setZoom(1); return }
    const pages = doc.pageOrder.map(value => doc.pages[value]); if (!pages.length) return
    const w = Math.max(...pages.map(p => p.x + p.width)) - origin.x + 128, h = Math.max(...pages.map(p => p.y + p.height)) - origin.y + 128
    setZoom(Math.max(.04, Math.min(4, Math.min((viewport.width-64)/w, (viewport.height-100)/h) * 2)))
    viewportRef.current?.scrollTo({ left: 0, top: 0 })
  }
  const startPresentation = (notes = false) => { flushText(); setEditingId(null); setNotesOpen(notes); setPresenting(true); setZoom(1) }
  const reorderLayer = (front: boolean) => { if (current && writable) dispatch([{ type: 'nodes.reorder', pageId: current.id, nodeIds: front ? [...current.nodeOrder.filter(id => !selected.includes(id)), ...current.nodeOrder.filter(id => selected.includes(id))] : [...current.nodeOrder.filter(id => selected.includes(id)), ...current.nodeOrder.filter(id => !selected.includes(id))] }]) }
  const distribute = (axis: 'horizontal' | 'vertical') => { if (current) dispatch(distributeNodes(selectedNodes, axis).map(n => ({ type: 'node.patch', pageId: current.id, nodeId: n.id, patch: { x: n.x, y: n.y } }))) }
  if (visible && (!authorized || state.loading) && !state.error) return <div role="status" className="native-loading">正在打开{title}…</div>
  if (!doc) return <div className="native-loading" role="alert">{state.error || '稿件暂时无法打开'}{notice && <p>{notice}</p>}<button type="button" onClick={() => void session.open()}>重试</button><button type="button" onClick={() => void downloadSource()}>下载原始文件</button></div>
  const boardWidth = Math.max(viewport.width, ...doc.pageOrder.map(value => (displayPages[value].x - origin.x + doc.pages[value].width + 128) * scale))
  const boardHeight = Math.max(viewport.height, ...doc.pageOrder.map(value => (displayPages[value].y - origin.y + doc.pages[value].height + 128) * scale))
  return <DraftContext.Provider value={drafts}><section ref={editorRoot} data-view={view} data-tool={tool} data-inspector-open={inspectorOpen && !presenting} data-comments-open={commentsOpen && !presenting} style={{'--native-sidebar-width': `${!presenting ? (inspectorOpen ? 336 : 0) + (commentsOpen ? 300 : 0) : 0}px`} as CSSProperties} className={`native-editor native-kind-${kind} ${presenting ? 'native-presenting' : ''}`} data-native-artifact-editor={kind} data-save-state={state.conflict ? 'conflict' : state.pending ? 'pending' : draftCount ? 'draft' : 'saved'} aria-label={`${title}编辑器`} hidden={!visible} tabIndex={0}
    onKeyDown={event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); flushText(); void session.retry(); return }
      const typing = (event.target as HTMLElement).closest('input,textarea,[contenteditable="true"]')
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !(event.target as HTMLElement).closest('input,textarea') && !event.nativeEvent.isComposing) { event.preventDefault(); flushText(); setEditingId(null); void session.undoRedo(event.shiftKey ? 'redo' : 'undo'); return }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y' && !(event.target as HTMLElement).closest('input,textarea') && !event.nativeEvent.isComposing) { event.preventDefault(); flushText(); setEditingId(null); void session.undoRedo('redo'); return }
      if (typing || event.nativeEvent.isComposing) return
      if (event.key === ' ') { event.preventDefault(); space.current = true }
      if (event.key === 'Escape') { setCropping(null); setTool('select'); setContextMenu(null); setEditingId(null); if (presenting) { event.preventDefault(); event.stopPropagation(); setPresenting(false) } }
      if (presenting && ['ArrowRight', 'PageDown', 'ArrowLeft', 'PageUp'].includes(event.key)) { event.preventDefault(); navigatePresentation(event.key === 'ArrowRight' || event.key === 'PageDown' ? 1 : -1); return }
      if ((event.ctrlKey || event.metaKey) && event.key === '\\') { event.preventDefault(); setInspectorOpen(v => !v); return }
      if ((event.ctrlKey || event.metaKey) && event.key === '0') { event.preventDefault(); fitViewport(); return }
      if ((event.ctrlKey || event.metaKey) && ['+', '=', '-'].includes(event.key)) { event.preventDefault(); setZoom(v => Math.max(.04, Math.min(8, v * (event.key === '-' ? .8 : 1.25)))); return }
      if (!writable) return
      if (!event.ctrlKey && !event.metaKey && !event.altKey) { const next = ({ v: 'select', h: 'hand', t: 'text', n: 'note', p: 'pen', c: 'comment', a: 'frame' } as Record<string, string>)[event.key.toLowerCase()]; if (next && (kind === 'design' || !['note','frame','pen'].includes(next))) { setTool(next); event.preventDefault() } }
      if ((event.ctrlKey || event.metaKey) && event.key === 'a') { event.preventDefault(); setSelected(current?.nodeOrder ?? []) }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); pasteNodes(selectedWithChildren()) }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'g') { event.preventDefault(); event.shiftKey ? ungroup() : groupSelection() }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelection() }
      if (event.altKey && ['ArrowUp','ArrowDown'].includes(event.key)) { event.preventDefault(); void pageAction(event.key==='ArrowUp'?'up':'down'); return }
      if (current && selected.length && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); const step = event.shiftKey ? 10 : 1; dispatch(selectedNodes.map(node => ({ type: 'node.patch', pageId: current.id, nodeId: node.id, patch: { x: node.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0), y: node.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0) } }))) }
    }} onKeyUp={event => { if (event.key === ' ') space.current = false }}
    onContextMenu={event => { if (presenting || (event.target as HTMLElement).closest('input,textarea,[contenteditable="true"]')) return; event.preventDefault(); const rect=event.currentTarget.getBoundingClientRect(); const target=(event.target as HTMLElement).closest<HTMLElement>('[data-node-id]'), shell=(event.target as HTMLElement).closest<HTMLElement>('[data-page-id]'); if (target && shell) { setPageId(shell.dataset.pageId!); if (!selected.includes(target.dataset.nodeId!)) setSelected([target.dataset.nodeId!]) } setContextMenu({x:Math.max(4,Math.min(rect.width-228,event.clientX-rect.left)),y:Math.max(4,Math.min(rect.height-360,event.clientY-rect.top))}) }}
    onCopy={event => { if ((event.target as HTMLElement).closest('input,textarea,[contenteditable="true"]')) return; copySelection(); if (clipboard.current.length) { event.clipboardData.setData('application/lingxi-nodes', JSON.stringify(clipboard.current)); event.clipboardData.setData('text/plain', selectedNodes.map(node => node.text ?? node.source ?? '').join('\n')); event.preventDefault() } }}
    onPaste={event => { if ((event.target as HTMLElement).closest('input,textarea,[contenteditable="true"]')) return; const raw = event.clipboardData.getData('application/lingxi-nodes'); if (raw) { try { pasteNodes(JSON.parse(raw)); event.preventDefault() } catch { setNotice('无法粘贴此内容。') } } else if (event.clipboardData.files.length) { void uploadImage(event.clipboardData.files[0]); event.preventDefault() } else if (event.clipboardData.getData('text/plain')) { addNode('text', { text: event.clipboardData.getData('text/plain') }); event.preventDefault() } }}>
    {!presenting && <header className="native-toolbar" aria-label="编辑工具">
      <div className="native-toolbar-island native-insert-tools">
        {kind === 'design' && <><Menu label="页面菜单" text={current?.section || '页面 1'}>
          {[...new Set(doc.pageOrder.map(value => doc.pages[value].section || '页面 1'))].map(section => <MenuItem key={section} onClick={() => { const p = doc.pageOrder.find(value => (doc.pages[value].section || '页面 1') === section); if (p) selectPage(p) }}>{section}</MenuItem>)}
          <hr /><MenuItem icon="plus" disabled={!writable} onClick={addPage}>添加画板</MenuItem><MenuItem icon="pencil" disabled={!writable || !current} onClick={() => { setDialogText(current?.title ?? ''); setDialog('rename') }}>重命名画板</MenuItem><MenuItem icon="layers" onClick={() => setLayersOpen(v => !v)}>图层</MenuItem>
          <hr /><MenuItem icon="undo" disabled={!state.history.undo || !writable} shortcut="⌘ Z" onClick={() => { flushText(); void session.undoRedo('undo') }}>撤销</MenuItem><MenuItem icon="redo" disabled={!state.history.redo || !writable} shortcut="⌘ ⇧ Z" onClick={() => { flushText(); void session.undoRedo('redo') }}>重做</MenuItem>
        </Menu><span className="native-toolbar-separator" /><IconButton icon="select" label="选择 (V)" active={tool === 'select'} onClick={() => setTool('select')} /><IconButton icon="hand" label="手型工具 (H)" active={tool === 'hand'} onClick={() => setTool('hand')} /></>}
        <IconButton icon="text" label="文本" active={tool === 'text'} disabled={!writable || !current} onClick={() => setTool(v => v === 'text' ? 'select' : 'text')} />
        {kind === 'design' ? <><IconButton icon="frame" label="添加画板" disabled={!writable} onClick={addPage} /><IconButton icon="note" label="便签 (N)" active={tool === 'note'} disabled={!writable || !current} onClick={() => setTool('note')} /><IconButton icon="pencil" label="铅笔" active={tool === 'pencil'} disabled={!writable || !current} onClick={() => setTool('pencil')} /><Menu label="绘图工具"><MenuItem icon="pencil" onClick={() => setTool('pencil')}>铅笔</MenuItem><MenuItem icon="pen" onClick={() => setTool('pen')}>钢笔</MenuItem><MenuItem icon="arrow" onClick={() => setTool('arrow')}>箭头</MenuItem></Menu></> : <><IconButton icon="image" label="图片或视频" disabled={!writable || !current} onClick={() => fileInput.current?.click()} /><Menu label="插入表格" icon="table" disabled={!writable || !current}><div className="native-table-picker">{Array.from({ length: 36 }, (_, i) => <button type="button" key={i} aria-label={`插入 ${Math.floor(i / 6)+1} 行 ${i%6+1} 列表格`} onClick={() => addNode('table', { cells: Array.from({ length: Math.floor(i/6)+1 }, () => Array(i%6+1).fill('')) })}>{Math.floor(i/6)+1}×{i%6+1}</button>)}</div></Menu></>}
        <Menu label="插入图形" icon={kind === 'design' ? 'square' : 'shapes'} disabled={!writable || !current}>
          {(['rect','ellipse','triangle','diamond','arrow'] as const).map(shape => <MenuItem key={shape} icon={shape === 'rect' ? 'square' : shape} onClick={() => { setShapeTool(shape); kind === 'design' ? setTool('shape') : addNode('shape', { shape }) }}>{({rect:'矩形',ellipse:'椭圆',triangle:'三角形',diamond:'菱形',arrow:'箭头'})[shape]}</MenuItem>)}
          <hr /><MenuItem icon="line" onClick={() => addNode('line', { height: 40, lineEnd: 'none' })}>直线</MenuItem><MenuItem icon="arrow" onClick={() => addNode('line', { height: 40, lineEnd: 'arrow' })}>连接线</MenuItem><MenuItem onClick={() => addNode('math')}>公式</MenuItem>{kind === 'design' && <MenuItem icon="image" onClick={() => fileInput.current?.click()}>图片或视频</MenuItem>}
        </Menu>
      </div>
      <div className="native-toolbar-island native-view-tools">
        <Menu label="导出格式" icon="download" align="end" disabled={!!exporting}><MenuItem onClick={() => void doExport('pdf')}>PDF</MenuItem><MenuItem onClick={() => void doExport('html')}>HTML 网页</MenuItem><MenuItem onClick={() => void doExport('pptx')}>PowerPoint</MenuItem><hr /><MenuItem onClick={() => void doExport('png')}>当前{kind === 'design' ? '画板' : '页面'} · PNG</MenuItem><MenuItem onClick={() => void doExport('jpeg')}>当前{kind === 'design' ? '画板' : '页面'} · JPEG</MenuItem><MenuItem onClick={() => void doExport('svg')}>当前{kind === 'design' ? '画板' : '页面'} · SVG</MenuItem>{Boolean(state.original) && <><hr /><MenuItem onClick={() => void downloadSource()}>原始文件</MenuItem></>}</Menu>
        <IconButton icon="play" label="放映" disabled={!current} onClick={() => startPresentation()} />
        <span className="native-toolbar-separator" /><IconButton icon="panel" label="显示属性" active={inspectorOpen} onClick={() => { setCommentsOpen(false); setInspectorOpen(v => !v) }} />
        <Menu label="历史记录" icon="undo" align="end"><MenuItem icon="undo" disabled={!writable || !state.history.undo} onClick={() => { flushText(); void session.undoRedo('undo') }}>撤销</MenuItem><MenuItem icon="redo" disabled={!writable || !state.history.redo} onClick={() => { flushText(); void session.undoRedo('redo') }}>重做</MenuItem></Menu><span className="native-toolbar-separator" /><Menu label="画布缩放" text={`${Math.round(scale*100)}%`} align="end"><MenuItem icon="fit" shortcut="⌘ 0" onClick={fitViewport}>{canvasMode ? '适应全部画板' : '适应页面'}</MenuItem>{[.25,.5,.75,1,1.5,2,4].map(value => <MenuItem key={value} onClick={() => setZoom(canvasMode ? value*2 : value / (scale/zoom))}>{Math.round(value*100)}%</MenuItem>)}<hr /><MenuItem icon="notes" selected={notesOpen} onClick={() => setNotesOpen(v => !v)}>讲者备注</MenuItem><MenuItem icon="guides" selected={guidesOpen} onClick={() => setGuidesOpen(v => !v)}>布局参考线</MenuItem><MenuItem icon="layers" selected={layersOpen} onClick={() => setLayersOpen(v => !v)}>图层</MenuItem>{kind === 'slides' && <><MenuItem icon="slides" selected={view === 'slide'} onClick={() => setView('slide')}>幻灯片视图</MenuItem><MenuItem icon="grid" selected={view === 'grid'} onClick={() => setView('grid')}>网格视图</MenuItem><MenuItem icon="frame" selected={view === 'canvas'} onClick={() => setView('canvas')}>画布视图</MenuItem></>}</Menu>
      </div>
      <span className="native-save-status" role="status">{!state.write ? '仅查看' : state.conflict ? '有冲突，修改未保存' : state.pending ? `正在保存 ${state.pending} 项修改` : draftCount ? '有未保存的修改' : ''}{agentWorking ? ' · Agent 正在编辑' : ''}</span>
      <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml,video/mp4,video/webm,video/ogg" hidden onChange={event => { const file = event.target.files?.[0]; if (file) void uploadImage(file); event.target.value = '' }} />
    </header>}
    {(state.error || notice || exporting) && <div className="native-notice" role={state.error ? 'alert' : 'status'}>{state.error || notice || exporting}{exporting && <button type="button" onClick={() => exportingAbort.current?.abort()}>取消导出</button>}{state.error && <><button type="button" onClick={() => download(new Blob([JSON.stringify(session.recovery())], { type: 'application/json' }), `${title}.lingxi-recovery.json`)}>下载本地副本</button>{state.conflict ? <button type="button" onClick={() => { download(new Blob([JSON.stringify(session.recovery())], { type: 'application/json' }), `${title}.lingxi-recovery.json`); void session.discardAfterRecovery() }}>保留副本并重新载入</button> : <button type="button" onClick={() => void session.retry()}>重试保存</button>}</>}{notice && <button type="button" onClick={() => setNotice('')}>关闭</button>}</div>}
    <div className="native-workspace">
      {!presenting && layersOpen && current && <aside className="native-layers" aria-label="图层"><header><h3>图层</h3><IconButton icon="close" label="关闭图层" onClick={() => setLayersOpen(false)} /></header>{[...current.nodeOrder].reverse().map(value => { const n = current.nodes[value]; return <div className="native-layer" key={value} data-selected={selected.includes(value)}><button type="button" style={{ paddingInlineStart: n.parentId ? 24 : 8 }} onClick={e => setSelected(e.shiftKey ? [...new Set([...selected,value])] : [value])}><EditorIcon name={n.type === 'text' ? 'text' : n.type === 'image' ? 'image' : n.type === 'group' ? 'layers' : n.type === 'note' ? 'note' : 'square'} size={15} /><span>{n.name || n.text || ({drawing:'绘图',video:'视频',shape:'形状',group:'组合',image:'图片',line:'连接线',table:'表格',svg:'SVG',math:'公式',embed:'交互内容',text:'文本',note:'便签'})[n.type]}</span></button><IconButton icon="eye" label={n.hidden ? '显示图层' : '隐藏图层'} active={!n.hidden} disabled={!writable} onClick={() => dispatch([{ type:'node.patch',pageId:current.id,nodeId:value,patch:{hidden:!n.hidden} }])} /><IconButton icon="lock" label={n.locked ? '解锁图层' : '锁定图层'} active={n.locked} disabled={!writable} onClick={() => dispatch([{type:'node.patch',pageId:current.id,nodeId:value,patch:{locked:!n.locked}}])} /></div> })}</aside>}

      <div className="native-stage" ref={viewportRef} hidden={view === 'grid' && !presenting} onScroll={event => { const x = event.currentTarget.scrollLeft, y = event.currentTarget.scrollTop; setViewport(value => ({ ...value, x, y })) }} onWheel={event => { if (event.ctrlKey || event.metaKey) { event.preventDefault(); setZoom(value => Math.max(.15, Math.min(4, value * (event.deltaY > 0 ? .9 : 1.1)))) } }}>
        {!doc.pageOrder.length && <div className="native-empty"><p>{kind === 'design' ? '添加第一个画板' : '添加第一页'}</p><button type="button" disabled={!writable} onClick={addPage}>开始编辑</button></div>}
        <div onPointerDown={e => { if (canvasMode && current && e.target === e.currentTarget) pointerDown(e, current, true) }} onPointerMove={pointerMove} onPointerUp={e => pointerUp(e)} onPointerCancel={e => pointerUp(e,true)} className={`native-board-space ${!canvasMode ? 'native-single-page' : ''}`} style={canvasMode ? { width: boardWidth+canvasInset.x, height: boardHeight+canvasInset.y } : { minWidth: '100%', minHeight: '100%' }}>
          {boards.map(page => <div key={page.id} className={`native-page-shell ${presenting ? `native-transition-${page.transition}` : ''}`} data-page-id={!canvasMode || scale>=.15 || page.id===pageId ? page.id : undefined} data-artboard-id={page.id} style={{ width: page.width * scale, height: page.height * scale, ...(canvasMode ? { position: 'absolute', left: (page.x - origin.x + 64) * scale+canvasInset.x, top: (page.y - origin.y + 64) * scale+canvasInset.y } : {}) }}>
            {canvasMode && <button type="button" className="native-board-label" onClick={() => selectPage(page.id)}>{page.title}</button>}
            {canvasMode && scale < .15 && page.id!==pageId ? <button type="button" className="native-board-thumbnail" data-page-target={page.id} aria-label={`选择画板 ${page.title}`} onClick={()=>selectPage(page.id)} onDoubleClick={()=>{setZoom(1);selectPage(page.id)}}><PageThumbnail page={state.loadedPageIds.includes(page.id) ? page : state.previews?.[page.id] ?? page} document={doc} loaded={state.loadedPageIds.includes(page.id)||!!state.previews?.[page.id]} /></button> : <div className="native-page-scaled" style={{ width: page.width, height: page.height, transform: `scale(${scale})` }} onPointerDown={event => pointerDown(event, page)} onPointerMove={pointerMove} onPointerUp={event => pointerUp(event)} onPointerCancel={event => pointerUp(event, true)} onDoubleClick={event => { const target = (event.target as HTMLElement).closest<HTMLElement>('[data-node-id]'); const node = target && page.nodes[target.dataset.nodeId ?? '']; if (node && writable && (node.type==='image'||node.type==='video')) { setPageId(page.id); setSelected([node.id]); setCropping(node); return } if (node && writable && (node.type === 'text' || node.type === 'note' || node.type === 'table')) { if (editingId === node.id && textPage.current === page.id) return; setPageId(page.id); setSelected([node.id]); textBase.current = session.getSnapshot().document; textPage.current = page.id; setEditingId(node.id) } }}>
              <PageContent document={renderDocument ?? doc} page={page} compute={compute} visibleNodeIds={visibleElements[page.id]?.ids ?? new Set()} contentBottom={visibleElements[page.id]?.bottom} editingId={page.id === pageId ? editingId : null} onTextChange={changeText} onFinishText={finishText} onCellChange={changeCell} onFlowSize={flowSize} presenting={presenting} />
              {canvasMode && <PageContent canvasOnly document={renderDocument ?? doc} page={page} compute={compute} visibleNodeIds={visibleElements[page.id]?.ids ?? new Set()} editingId={page.id === pageId ? editingId : null} onTextChange={changeText} onFinishText={finishText} onCellChange={changeCell} />}
              {!presenting && cropping && page.id === pageId && <Suspense fallback={null}><CropEditor key={cropping.id} node={cropping} pageId={page.id} scale={scale} base={session.getSnapshot().document!} onCommit={dispatch} onClose={()=>setCropping(null)} /></Suspense>}
              {!presenting && guidesOpen && page.guides?.map((guide,index) => <div key={index} className={`native-guide native-guide-${guide.axis}`} style={guide.axis === 'x' ? { left: guide.position } : { top: guide.position }} />)}
              {!presenting && guidesOpen && page.layoutGuides?.filter(g=>!g.hidden).map((guide,index)=>{const horizontal=guide.kind==='rows',dimension=horizontal?page.height:page.width,step=guide.kind==='grid'?Math.max(1,guide.size):Math.max(1,(dimension-2*guide.margin+guide.gutter)/guide.count),size=guide.kind==='grid'?1:Math.max(1,step-guide.gutter);return guide.kind==='grid' ? <svg key={`layout-${index}`} className="native-layout-guide" width={page.width} height={page.height}><defs><pattern id={`guide-${page.id}-${index}`} width={step} height={step} patternUnits="userSpaceOnUse"><path d={`M ${step} 0 L 0 0 0 ${step}`} fill="none" stroke={guide.color} strokeWidth="1" /></pattern></defs><rect width="100%" height="100%" fill={`url(#guide-${page.id}-${index})`} /></svg> : <div key={`layout-${index}`} className="native-layout-guide">{Array.from({length:guide.count},(_,i)=><div key={i} style={{position:'absolute',background:guide.color,...(horizontal?{top:guide.margin+i*step,left:0,width:page.width,height:size}:{left:guide.margin+i*step,top:0,width:size,height:page.height})}} />)}</div>})}
              {!presenting && drawingPreview && page.id === pageId && <svg className="native-drawing-preview" width={page.width} height={page.height}><polyline points={drawingPreview.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="2" /></svg>}
              {!presenting && commentThreads.filter(t => t.status === 'open').map((thread,index) => { const anchor = decodeCommentAnchor(thread.anchor); const point = anchor?.pageId === page.id ? commentPoint(anchor, page) : null; return point && <button type="button" key={thread.id} className="native-comment-pin" aria-label={`评论 ${index+1}：${thread.label}`} style={{ left: point.x, top: point.y, transform: `scale(${1/scale})` }} onClick={() => setCommentsOpen(true)}>{index+1}</button> })}
              {!presenting && page.id === pageId && <div className="native-interaction-layer" data-interaction-layer>{selectedNodes.filter(node => node.id !== editingId && node.id !== cropping?.id).map(node => { let x = node.x, y = node.y; let parent = node.parentId ? page.nodes[node.parentId] : undefined; while (parent) { x += parent.x; y += parent.y; parent = parent.parentId ? page.nodes[parent.parentId] : undefined } return <div key={node.id} className="native-selection" style={{ left: x + (preview && !preview.resize ? preview.dx : 0), top: y + (preview && !preview.resize ? preview.dy : 0), width: Math.max(16, node.width + (preview?.resize ? preview.dx : 0)), height: Math.max(16, node.height + (preview?.resize ? preview.dy : 0)), transform: `rotate(${node.rotation}deg)`, borderWidth: 1.5 / scale }}>{writable && !node.locked && <>{(['nw','n','ne','e','se','s','sw','w'] as const).map(handle => <button type="button" key={handle} className={`native-resize-handle native-handle-${handle}`} style={{ width: 7 / scale, height: 7 / scale }} aria-label={`调整元素大小 ${handle}`} onPointerDown={event => { event.stopPropagation(); gesture.current = { base: session.getSnapshot().document!, type: 'resize', handle, startX: event.clientX, startY: event.clientY, pageId: page.id, nodes: selectedNodes.filter(item => !item.locked), moved: false }; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={pointerMove} onPointerUp={event => pointerUp(event)} onPointerCancel={event => pointerUp(event, true)} />)}<button type="button" className="native-rotate-handle" style={{ width: 10/scale, height: 10/scale, top: -24/scale }} aria-label="旋转元素" onPointerDown={event => { event.stopPropagation(); gesture.current = { base: session.getSnapshot().document!, type: 'rotate', startX: event.clientX, startY: event.clientY, pageId: page.id, nodes: [node], moved: false }; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={pointerMove} onPointerUp={event => pointerUp(event)} onPointerCancel={event => pointerUp(event,true)} /></>}</div> })}{marquee && <div className="native-marquee" style={marquee as CSSProperties} />}</div>}
            </div>}
          </div>)}
        </div>
      </div>
      {!presenting && view === 'grid' && <PageRail grid document={doc} current={pageId} selected={pageSelection} loadedPageIds={state.loadedPageIds} previews={state.previews} writable={writable} onSelect={choosePage} onOpen={value => { selectPage(value); setView('slide') }} onReorder={pageIds => dispatch([{ type: 'pages.reorder', pageIds }])} onAction={pageAction} onVisible={()=>{}} />}
      {!presenting && inspectorOpen && <aside className="native-inspector" aria-label="属性面板" onFocusCapture={() => { inspectorBase.current = session.getSnapshot().document }}><header className="native-inspector-header"><button type="button" className="native-panel-tab" aria-pressed={inspectorTab==='properties'} onClick={()=>setInspectorTab('properties')}>属性</button><button type="button" className="native-panel-tab" aria-pressed={inspectorTab==='theme'} onClick={()=>setInspectorTab('theme')}>主题</button><span style={{flex:1}} /><IconButton icon="close" label="关闭属性" onClick={() => setInspectorOpen(false)} /></header>
      {inspectorTab === 'theme' && <div className="native-theme-picker" aria-label="主题选择"><button type="button" aria-pressed={!doc.themeId} disabled={!writable} onClick={()=>dispatch([{type:'document.patch',patch:{themeId:null}}])}>默认主题</button>{Object.values(doc.themes).map(theme=><button type="button" key={theme.id} aria-label={`使用主题 ${theme.name}`} disabled={!writable} aria-pressed={doc.themeId===theme.id} onClick={()=>dispatch([{type:'document.patch',patch:{themeId:theme.id}}])}><span className="native-theme-preview" style={{background:String(theme.tokens.background??'#faf8f4'),color:String(theme.tokens.text??'#141413')}}>Aa</span>{theme.name}</button>)}</div>}
      <div hidden={inspectorTab!=='properties'}><fieldset disabled={!writable}>
        {primary ? <><h3>{({ note: '便签', drawing: '绘图', video: '视频', text: '文本', image: '图片', shape: '图形', line: '连接线', table: '表格', svg: 'SVG', math: '公式', group: '组合', embed: '隔离内容' })[primary.type]}</h3>
          <div className="native-field-grid">{(['x', 'y', 'width', 'height', 'rotation'] as const).map(key => <Field key={key} label={({ x: 'X', y: 'Y', width: '宽', height: '高', rotation: '旋转' })[key]} type="number" value={primary[key]} onChange={value => { if (Number.isFinite(Number(value))) patchNode({ [key]: Number(value) }) }} />)}</div>
          <Field label="颜色" type="color" value={artifactResolvedStyle(primary.style, doc).color ?? '#222222'} onChange={value => patchNode({ style: { color: value } }, ['style.themeColor'])} />
          <Field label="填充" type="color" value={artifactResolvedStyle(primary.style, doc).fill ?? '#ffffff'} onChange={value => patchNode({ style: { fill: value } }, ['style.themeFill'])} />
          <Field label="描边" type="color" value={primary.style.stroke ?? '#000000'} onChange={value => patchNode({ style: { stroke: value } })} /><Field label="线宽" type="number" min={0} value={primary.style.strokeWidth ?? 1} onChange={value => patchNode({ style: { strokeWidth: Math.max(0, Number(value)) } })} /><Field label="不透明度" type="number" min={0} max={1} value={primary.style.opacity ?? 1} onChange={value => patchNode({ style: { opacity: Math.max(0, Math.min(1, Number(value))) } })} /><Field label="字体" value={artifactResolvedStyle(primary.style, doc).fontFamily ?? 'sans-serif'} onChange={value => patchNode({ style: { fontFamily: value } }, ['style.themeFont'])} />
          <Field label="字号" type="number" min={1} max={1000} value={primary.style.fontSize ?? 32} onChange={value => patchNode({ style: { fontSize: Math.max(1, Number(value)) } })} />
          <label className="native-field"><span>对齐</span><select value={primary.style.textAlign ?? 'left'} onChange={event => patchNode({ style: { textAlign: event.target.value as 'left' | 'center' | 'right' } })}><option value="left">左</option><option value="center">居中</option><option value="right">右</option></select></label>
          {primary.type === 'math' && <label className="native-textarea"><span>LaTeX 公式</span><TextAreaField key={primary.id} label="LaTeX 公式源码" value={primary.source ?? ''} onCommit={source => patchNode({ source })} /></label>}
          {(primary.type === 'image' || primary.type === 'video') && <><button type="button" onClick={() => { replaceImage.current = true; fileInput.current?.click() }}>替换图片</button><button type="button" onClick={()=>setCropping(primary)}>裁剪</button><h4>图片裁剪（0–1）</h4>{(['x', 'y', 'width', 'height'] as const).map(key => <Field key={key} label={key} type="number" min={0} max={1} value={primary.crop?.[key] ?? (key === 'width' || key === 'height' ? 1 : 0)} onChange={value => patchNode({ crop: { x: 0, y: 0, width: 1, height: 1, ...primary.crop, [key]: Math.max(key === 'width' || key === 'height' ? .01 : 0, Math.min(1, Number(value))) } })} />)}</>}
          {primary.type === 'group' && <><button type="button" onClick={ungroup}>取消组合</button><label className="native-field"><span>布局</span><select value={primary.layout?.mode ?? 'absolute'} onChange={event => patchNode({ layout: { ...primary.layout, mode: event.target.value as 'absolute' | 'flex' | 'grid' } })}><option value="absolute">自由布局</option><option value="flex">弹性布局</option><option value="grid">网格</option></select></label></>}
          {primary.type === 'table' && <div className="native-inspector-actions"><button type="button" onClick={() => patchNode({ cells: [...(primary.cells ?? []), (primary.cells?.[0] ?? ['', '']).map(() => '')] })}>添加行</button><button type="button" onClick={() => patchNode({ cells: primary.cells?.map(row => [...row, '']) })}>添加列</button></div>}
          <h4>外观</h4><Field label="圆角" type="number" min={0} value={primary.style.borderRadius ?? 0} onChange={value => patchNode({style:{borderRadius:Math.max(0,Number(value))}})} /><Field label="字重" type="number" min={100} max={1000} value={primary.style.fontWeight ?? 400} onChange={value => patchNode({style:{fontWeight:Math.max(100,Math.min(1000,Math.round(Number(value))))}})} /><Field label="行高" type="number" min={.5} max={10} value={primary.style.lineHeight ?? 1.25} onChange={value => patchNode({style:{lineHeight:Math.max(.5,Math.min(10,Number(value)))}})} /><Field label="字距" type="number" value={primary.style.letterSpacing ?? 0} onChange={value => patchNode({style:{letterSpacing:Number(value)}})} />
          <label className="native-field"><span>描边样式</span><select aria-label="描边样式" value={primary.style.borderStyle ?? 'solid'} onChange={e => patchNode({style:{borderStyle:e.target.value as 'solid'|'dashed'|'dotted'|'double'|'none'}})}><option value="solid">实线</option><option value="dashed">虚线</option><option value="dotted">点线</option><option value="double">双线</option><option value="none">无</option></select></label>
          <details className="native-inspector-section"><summary>渐变</summary><label className="native-field"><span>填充类型</span><select aria-label="填充类型" value={primary.style.gradient?.type ?? 'solid'} onChange={e => e.target.value === 'solid' ? patchNode({}, ['style.gradient']) : patchNode({style:{gradient:{type:e.target.value as 'linear'|'radial',angle:90,stops:[{color:'#d97757',offset:0},{color:'#f5d5c6',offset:1}]}}})}><option value="solid">纯色</option><option value="linear">线性渐变</option><option value="radial">径向渐变</option></select></label>{primary.style.gradient && <><Field label="角度" type="number" value={primary.style.gradient.angle} onChange={v => patchNode({style:{gradient:{...primary.style.gradient!,angle:Number(v)}}})} />{primary.style.gradient.stops.map((stop,index) => <div key={index} className="native-gradient-stop"><Field label={`色标 ${index+1}`} type="color" value={stop.color} onChange={color => patchNode({style:{gradient:{...primary.style.gradient!,stops:primary.style.gradient!.stops.map((s,i) => i===index ? {...s,color} : s)}}})} /><Field label="位置" type="number" min={0} max={1} value={stop.offset} onChange={v => patchNode({style:{gradient:{...primary.style.gradient!,stops:primary.style.gradient!.stops.map((s,i) => i===index ? {...s,offset:Math.max(0,Math.min(1,Number(v)))} : s)}}})} /></div>)}<button type="button" onClick={() => patchNode({style:{gradient:{...primary.style.gradient!,stops:[...primary.style.gradient!.stops,{color:'#ffffff',offset:.5}]}}})}>添加色标</button></>}</details>
          <details className="native-inspector-section"><summary>阴影</summary><label className="native-check"><input type="checkbox" checked={!!primary.style.shadow} onChange={e => e.target.checked ? patchNode({style:{shadow:{x:0,y:4,blur:12,spread:0,color:'#00000040'}}}) : patchNode({},['style.shadow'])} />阴影</label>{primary.style.shadow && <>{(['x','y','blur','spread'] as const).map(key => <Field key={key} label={({x:'X',y:'Y',blur:'模糊',spread:'扩展'})[key]} type="number" value={primary.style.shadow![key]} onChange={v => patchNode({style:{shadow:{...primary.style.shadow!,[key]:key === 'blur' ? Math.max(0,Number(v)) : Number(v)}}})} />)}<Field label="阴影颜色" type="color" value={primary.style.shadow.color.slice(0,7)} onChange={color => patchNode({style:{shadow:{...primary.style.shadow!,color}}})} /></>}</details>
          <div className="native-inspector-actions"><IconButton icon="flipX" label="水平翻转" active={primary.flipX} onClick={() => patchNode({flipX:!primary.flipX})} /><IconButton icon="flipY" label="垂直翻转" active={primary.flipY} onClick={() => patchNode({flipY:!primary.flipY})} /><IconButton icon="up" label="置于顶层" onClick={() => reorderLayer(true)} /><IconButton icon="down" label="置于底层" onClick={() => reorderLayer(false)} /></div>
          <label className="native-check"><input type="checkbox" checked={primary.locked ?? false} onChange={event => patchNode({ locked: event.target.checked })} />锁定</label>
          <button type="button" onClick={() => { if (current) inspectDispatch([{ type: 'nodes.reorder', pageId: current.id, nodeIds: [...current.nodeOrder.filter(value => value !== primary.id), primary.id] }]) }}>置于顶层</button>
        </> : selected.length > 1 ? <><h3>已选 {selected.length} 个元素</h3><button type="button" onClick={groupSelection}>组合</button></> : current ? <><h3>{kind === 'slides' ? '页面' : '画板'}</h3>{kind === 'design' && <div className="native-field-grid">{(['x', 'y'] as const).map(axis => <Field key={axis} label={`画板 ${axis.toUpperCase()}`} type="number" value={current[axis]} onChange={value => { if (Number.isFinite(Number(value))) inspectDispatch([{ type: 'page.patch', pageId: current.id, patch: { [axis]: Number(value) } }]) }} />)}</div>}<label className="native-field"><span>纸张</span><select aria-label="页面尺寸" value={current.paper ?? 'custom'} onChange={event => { const paper = event.target.value as 'A4' | 'Letter' | 'custom'; inspectDispatch([{ type: 'page.patch', pageId: current.id, patch: { paper, ...(paper === 'A4' ? { width: 794, height: 1123 } : paper === 'Letter' ? { width: 816, height: 1056 } : {}) } }]) }}><option value="custom">自定义</option><option value="A4">A4</option><option value="Letter">Letter</option></select></label><label className="native-field"><span>页面高度</span><select aria-label="页面高度模式" value={current.sizing ?? 'fixed'} onChange={event => inspectDispatch([{ type: 'page.patch', pageId: current.id, patch: { sizing: event.target.value as 'fixed' | 'flow' } }])}><option value="fixed">固定</option><option value="flow">随内容增长</option></select></label><Field label="标题" value={current.title} onChange={value => inspectDispatch([{ type: 'page.patch', pageId: current.id, patch: { title: value } }])} /><Field label="宽" type="number" value={current.width} onChange={value => inspectDispatch([{ type: 'page.patch', pageId: current.id, patch: { width: Math.max(1, Number(value)) } }])} /><Field label="高" type="number" value={current.height} onChange={value => inspectDispatch([{ type: 'page.patch', pageId: current.id, patch: { height: Math.max(1, Number(value)) } }])} /><Field label="背景" type="color" value={artifactPageBackground(current, doc)} onChange={value => inspectDispatch([{ type: 'page.patch', pageId: current.id, patch: { background: value }, unset: ['themeBackground'] }])} /><label className="native-check"><input type="checkbox" checked={current.skip} onChange={event => inspectDispatch([{ type: 'page.patch', pageId: current.id, patch: { skip: event.target.checked } }])} />放映时跳过</label><label className="native-field"><span>转场</span><select value={current.transition} onChange={event => inspectDispatch([{ type: 'page.patch', pageId: current.id, patch: { transition: event.target.value as 'none' | 'fade' | 'slide' } }])}><option value="none">无</option><option value="fade">淡入</option><option value="slide">滑入</option></select></label><button type="button" onClick={() => { inspectDispatch([{ type: 'page.delete', pageId: current.id }]); setSelected([]) }}>删除页面</button></> : null}
        {!selected.length && current && <details className="native-inspector-section"><summary>布局参考线</summary>{(current.layoutGuides??[]).map((guide,index)=><div className="native-guide-settings" key={index}><label className="native-field"><span>类型</span><select value={guide.kind} onChange={e=>inspectDispatch([{type:'page.patch',pageId:current.id,patch:{layoutGuides:current.layoutGuides!.map((g,i)=>i===index?{...g,kind:e.target.value as 'columns'|'rows'|'grid'}:g)}}])}><option value="columns">列</option><option value="rows">行</option><option value="grid">网格</option></select></label>{(['count','size','gutter','margin'] as const).map(key=><Field key={key} label={({count:'数量',size:'尺寸',gutter:'间距',margin:'边距'})[key]} type="number" min={key==='count'?1:0} value={guide[key]} onChange={v=>inspectDispatch([{type:'page.patch',pageId:current.id,patch:{layoutGuides:current.layoutGuides!.map((g,i)=>i===index?{...g,[key]:Math.max(key==='count'?1:0,Math.min(key==='count'?1000:1000000,Number(v)))}:g)}}])} />)}<button type="button" onClick={()=>inspectDispatch([{type:'page.patch',pageId:current.id,patch:{layoutGuides:current.layoutGuides!.filter((_,i)=>i!==index)}}])}>移除参考线</button></div>)}<button type="button" disabled={(current.layoutGuides?.length??0)>=6} onClick={()=>inspectDispatch([{type:'page.patch',pageId:current.id,patch:{layoutGuides:[...(current.layoutGuides??[]),{kind:'columns',count:12,size:8,gutter:24,margin:80,color:'#ef44441a'}]}}])}>添加布局参考线</button></details>}
        {selected.length > 0 && <><h4>排列</h4><div className="native-inspector-actions">{(['left', 'center', 'right', 'top', 'middle', 'bottom'] as const).map(direction => <button type="button" key={direction} onClick={() => align(direction)}>{({ left: '左对齐', center: '水平居中', right: '右对齐', top: '顶部', middle: '垂直居中', bottom: '底部' })[direction]}</button>)}<button type="button" disabled={selected.length<3} onClick={() => distribute('horizontal')}>水平分布</button><button type="button" disabled={selected.length<3} onClick={() => distribute('vertical')}>垂直分布</button><button type="button" onClick={deleteSelection}>删除元素</button><button type="button" onClick={() => pasteNodes(selectedWithChildren())}>复制元素</button></div></>}
      </fieldset></div></aside>}
      {!presenting && commentsOpen && <Suspense fallback={<aside className="native-comments-panel" role="status">正在加载评论…</aside>}><CommentsPanel artifactId={artifactId} writable={writable} anchor={commentAnchor} label={current?.title ?? title} onClose={() => { setCommentsOpen(false); setCommentAnchor(null) }} onPlaced={() => setCommentAnchor(null)} onThreads={setCommentThreads} onNavigate={value => { const a = decodeCommentAnchor(value); if (a) { selectPage(a.pageId); if (a.nodeId) setSelected([a.nodeId]) } }} /></Suspense>}
    </div>
    {!presenting && kind === 'slides' && <footer className="native-footer"><div className="native-rail-toolbar"><IconButton icon="plus" label="添加页面" disabled={!writable} onClick={() => setDialog('layouts')} /><IconButton icon="notes" label="讲者备注" active={notesOpen} onClick={() => setNotesOpen(v => !v)} /><span className="native-rail-toolbar-spacer" /><IconButton icon="slides" label="幻灯片视图" active={view === 'slide'} onClick={() => setView('slide')} /><IconButton icon="grid" label="网格视图" active={view === 'grid'} onClick={() => setView('grid')} /><IconButton icon="chevron" label={railOpen ? '隐藏页面缩略图' : '显示页面缩略图'} onClick={() => setRailOpen(v => !v)} /></div>{railOpen && view === 'slide' && <PageRail document={doc} current={pageId} selected={pageSelection} loadedPageIds={state.loadedPageIds} previews={state.previews} writable={writable} onSelect={choosePage} onOpen={selectPage} onReorder={pageIds => dispatch([{type:'pages.reorder',pageIds}])} onAction={pageAction} onVisible={()=>{}} />}</footer>}
    {notesOpen && current && <aside className="native-notes" aria-label="讲者备注面板"><header><h3>讲者备注 · {doc.pageOrder.indexOf(current.id)+1} / {doc.pageOrder.length}</h3><IconButton icon="close" label="关闭备注" onClick={() => setNotesOpen(false)} /></header><TextAreaField key={current.id} label="讲者备注" value={current.notes} disabled={!state.write || state.conflict} placeholder="添加讲者备注" onFocus={() => { notesBase.current = session.getSnapshot().document }} onCommit={notes => { if (!state.write || state.conflict) return; dispatch([{type:'page.patch',pageId:current.id,patch:{notes}}],notesBase.current ?? undefined); notesBase.current = session.getSnapshot().document }} /></aside>}
    {!presenting && <button type="button" className="native-comment-launcher" aria-label="评论" aria-pressed={commentsOpen} onClick={() => { if (current && writable) setCommentAnchor({pageId:current.id,...(primary ? {nodeId:primary.id} : {}),x:.5,y:.5}); setInspectorOpen(false); setCommentsOpen(v => !v) }}><EditorIcon name="comments" size={21} /></button>}
    {presenting && <div className="native-present-controls"><IconButton icon="left" label="上一页" onClick={() => navigatePresentation(-1)} /><span>{current ? doc.pageOrder.indexOf(current.id)+1 : 0} / {doc.pageOrder.length}</span><IconButton icon="right" label="下一页" onClick={() => navigatePresentation(1)} /><IconButton icon="notes" label="讲者备注" onClick={() => setNotesOpen(v => !v)} /><IconButton icon="fit" label="全屏" onClick={() => void editorRoot.current?.requestFullscreen().catch(() => setNotice('请使用浏览器的全屏操作。'))} /><IconButton icon="close" label="退出放映" onClick={() => { setPresenting(false); if (window.document.fullscreenElement) void window.document.exitFullscreen() }} /></div>}
    {contextMenu && <div ref={menuRef} role="menu" aria-label="编辑操作" className="native-context-menu native-menu-popup" style={{left:contextMenu.x,top:contextMenu.y}} onClick={() => setContextMenu(null)}>
      <MenuItem icon="copy" disabled={!selected.length} shortcut="⌘ C" onClick={copySelection}>复制</MenuItem><MenuItem icon="copy" disabled={!writable || !selected.length} shortcut="⌘ D" onClick={() => pasteNodes(selectedWithChildren())}>创建副本</MenuItem><MenuItem disabled={!writable || !clipboard.current.length} shortcut="⌘ V" onClick={() => pasteNodes(clipboard.current)}>粘贴</MenuItem><hr />
      <MenuItem icon="layers" disabled={!writable || selected.length<2} shortcut="⌘ G" onClick={groupSelection}>组合</MenuItem><MenuItem disabled={!writable || primary?.type!=='group'} shortcut="⌘ ⇧ G" onClick={ungroup}>取消组合</MenuItem><MenuItem icon="up" disabled={!writable || !selected.length} onClick={() => reorderLayer(true)}>置于顶层</MenuItem><MenuItem icon="down" disabled={!writable || !selected.length} onClick={() => reorderLayer(false)}>置于底层</MenuItem><hr />
      <MenuItem icon="left" disabled={!writable || !selected.length} onClick={() => align('left')}>左对齐</MenuItem><MenuItem icon="center" disabled={!writable || !selected.length} onClick={() => align('center')}>水平居中</MenuItem><MenuItem icon="flipX" disabled={!writable || !primary || primary.type==='note'} onClick={() => patchNode({flipX:!primary?.flipX})}>水平翻转</MenuItem><MenuItem icon="flipY" disabled={!writable || !primary || primary.type==='note'} onClick={() => patchNode({flipY:!primary?.flipY})}>垂直翻转</MenuItem><hr />
      <MenuItem icon="comments" onClick={() => { if (current) setCommentAnchor({pageId:current.id,...(primary?{nodeId:primary.id}:{}),x:.5,y:.5});setCommentsOpen(true) }}>添加评论</MenuItem><MenuItem icon="delete" disabled={!writable || !selected.length} shortcut="⌫" onClick={deleteSelection}>删除</MenuItem>
    </div>}
    {dialog === 'layouts' && <Modal title="版式" onClose={() => setDialog(null)}><div className="native-layout-picker">{SLIDE_LAYOUTS.map(layout => <button type="button" key={layout.id} onClick={() => { const page = createPage(id(), `页面 ${doc.pageOrder.length+1}`); const nodes = layoutSlide(layout.id,page,id); page.nodes=Object.fromEntries(nodes.map(n => [n.id,n])); page.nodeOrder=nodes.map(n => n.id); dispatch([{type:'page.insert',page,index:current ? doc.pageOrder.indexOf(current.id)+1 : undefined}]); setPageId(page.id); setView('slide'); setSelected([]); setDialog(null) }}><span className={`native-layout-preview native-layout-${layout.id}`} aria-hidden="true">{(() => { const p=createPage(`preview-${layout.id}`); const nodes=layoutSlide(layout.id,p,()=>id()); p.nodes=Object.fromEntries(nodes.map(n=>[n.id,n])); p.nodeOrder=nodes.map(n=>n.id); return <PageThumbnail page={p} document={doc} loaded /> })()}</span>{layout.title}</button>)}</div></Modal>}
    {(dialog === 'rename' || dialog === 'section') && <Modal title={dialog === 'rename' ? '重命名画板' : '添加节'} onClose={() => setDialog(null)}><form className="native-name-form" onSubmit={e => { e.preventDefault(); if (!dialogText.trim()) return; dispatch(pageSelection.map(pageId => ({type:'page.patch',pageId,patch:dialog === 'rename' ? {title:dialogText.trim()} : {section:dialogText.trim()}}))); setDialog(null) }}><label>名称<input aria-label="名称" autoFocus value={dialogText} maxLength={dialog === 'section' ? 200 : 1000} onChange={e => setDialogText(e.target.value)} /></label><button className="native-primary" type="submit">保存</button></form></Modal>}
  </section></DraftContext.Provider>
}
