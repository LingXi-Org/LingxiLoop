import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
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
import { PageThumbnail } from './thumbnail'
import { NativeDrafts } from './drafts'
import { DraftContext, useLocalDraft } from './draft-context'
import type { ThemeTokens } from './compute'
import './native-editor.css'

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
function PageStrip({ document, loadedPageIds, current, onSelect, onReorder }: { document: ArtifactDocument; loadedPageIds: string[]; current: string | null; onSelect(id: string): void; onReorder(order: string[]): void }) {
  const [scroll, setScroll] = useState(0)
  const [height, setHeight] = useState(600)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => { if (!root.current) return; const observer = new ResizeObserver(entries => setHeight(entries[0].contentRect.height)); observer.observe(root.current); return () => observer.disconnect() }, [])
  const size = 72, start = Math.max(0, Math.floor(scroll / size) - 2), end = Math.min(document.pageOrder.length, Math.ceil((scroll + height) / size) + 2)
  const currentIndex = current ? document.pageOrder.indexOf(current) : -1
  useEffect(() => { if (root.current && currentIndex >= 0 && (currentIndex * size < root.current.scrollTop || currentIndex * size + size > root.current.scrollTop + height)) root.current.scrollTop = currentIndex * size }, [currentIndex, height])
  return <nav className="native-pages" aria-label={document.kind === 'slides' ? '页面导航' : '画板导航'}>
    <div className="native-page-list" ref={root} onScroll={event => setScroll(event.currentTarget.scrollTop)}>
      <div style={{ height: document.pageOrder.length * size, position: 'relative' }}>{document.pageOrder.slice(start, end).map((pageId, index) => {
        const page = document.pages[pageId]
        return <button type="button" key={pageId} data-page-target={pageId} aria-current={current === pageId ? 'page' : undefined} className="native-page-button" style={{ position: 'absolute', top: (index + start) * size, height: size - 4 }} onClick={() => onSelect(pageId)} draggable onDragStart={event => event.dataTransfer.setData('application/lingxi-page', pageId)} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const source = event.dataTransfer.getData('application/lingxi-page'); if (!document.pages[source] || source === pageId) return; const next = document.pageOrder.filter(value => value !== source); next.splice(next.indexOf(pageId), 0, source); onReorder(next) }}>
          <span className="native-page-preview"><PageThumbnail page={page} document={document} loaded={loadedPageIds.includes(pageId)} /><span className="native-page-number">{index + start + 1}</span></span><span className="native-page-title">{page.title || '未命名页面'}{page.skip ? ' · 已跳过' : ''}</span>
        </button>
      })}</div>
    </div>
    <div className="native-page-order"><button type="button" aria-label="页面上移" disabled={currentIndex <= 0} onClick={() => { const next = [...document.pageOrder]; [next[currentIndex - 1], next[currentIndex]] = [next[currentIndex], next[currentIndex - 1]]; onReorder(next) }}>↑</button><button type="button" aria-label="页面下移" disabled={currentIndex < 0 || currentIndex >= document.pageOrder.length - 1} onClick={() => { const next = [...document.pageOrder]; [next[currentIndex + 1], next[currentIndex]] = [next[currentIndex], next[currentIndex + 1]]; onReorder(next) }}>↓</button></div>
  </nav>
}
interface Gesture { base: ArtifactDocument; type: 'move' | 'resize' | 'marquee' | 'pan'; startX: number; startY: number; pageId: string; nodes: ArtifactNode[]; moved: boolean; scrollX?: number; scrollY?: number }
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
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [resolvedTheme, setResolvedTheme] = useState<{ source: ThemeTokens; tokens: ThemeTokens } | null>(null)
  const editorRoot = useRef<HTMLElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const replaceImage = useRef(false)
  const gesture = useRef<Gesture | null>(null)
  const space = useRef(false)
  const exportingAbort = useRef<AbortController | null>(null)
  const clipboard = useRef<ArtifactNode[]>([])
  const notesBase = useRef<ArtifactDocument | null>(null)
  const inspectorBase = useRef<ArtifactDocument | null>(null)
  const textBase = useRef<ArtifactDocument | null>(null)
  const textPage = useRef<string | null>(null)
  const lifetime = useRef<object | null>(null)
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
  const scale = kind === 'slides' && current ? Math.max(.05, Math.min((viewport.width - (presenting ? 0 : 64)) / current.width, (viewport.height - (presenting ? 0 : 64)) / current.height)) * zoom : zoom * .5
  const origin = useMemo(() => ({ x: doc ? Math.min(0, ...doc.pageOrder.map(value => doc.pages[value].x)) : 0, y: doc ? Math.min(0, ...doc.pageOrder.map(value => doc.pages[value].y)) : 0 }), [doc?.pageOrder, doc?.pages])
  useEffect(() => {
    if (!doc) return
    const upserts = doc.pageOrder.flatMap(value => { const p = doc.pages[value]; const hash = `${p.x},${p.y},${p.width},${p.height}`; if (geometry.current.get(value) === hash) return []; geometry.current.set(value, hash); return [{ id: value, x: p.x, y: p.y, width: p.width, height: p.height }] })
    const removed = [...geometry.current.keys()].filter(value => !doc.pages[value]); for (const value of removed) geometry.current.delete(value)
    const controller = new AbortController()
    void compute.updatePages(upserts, removed, doc.seq).then(() => {
      if (kind !== 'design') return
      return compute.visible({ x: viewport.x / scale + origin.x - 64, y: viewport.y / scale + origin.y - 64, width: viewport.width / scale + 128, height: viewport.height / scale + 128 }, doc.seq, controller.signal).then(setVisibleBoards)
    }).catch(error => { if (error?.name !== 'AbortError') setNotice('画板计算暂时不可用，请重试。') })
    return () => controller.abort()
  }, [doc, kind, viewport, scale, origin, compute])
  const boards = useMemo(() => {
    if (!doc || !visible || !authorized) return []
    if (kind === 'slides' || presenting) return current ? [current] : []
    const ids = new Set(visibleBoards); if (editingId && current) ids.add(current.id)
    return [...ids].flatMap(value => doc.pages[value] ? [doc.pages[value]] : [])
  }, [doc, visible, authorized, kind, presenting, current, visibleBoards, editingId])
  const visibleElements = useVisibleElements({ pages: boards, revision: doc?.seq ?? 0, viewport, scale, root: viewportRef, compute, pageId, selected, editingId, onError: setNotice })
  const themeTokens = doc?.themeId ? doc.themes[doc.themeId]?.tokens : undefined
  useEffect(() => {
    if (!themeTokens || !doc) return
    const controller = new AbortController()
    void compute.resolveTheme(themeTokens, doc.seq, controller.signal).then(result => { if (!controller.signal.aborted) { setResolvedTheme({ source: themeTokens, tokens: result.tokens }); if (result.issues.length) setNotice('主题包含无法解析的引用，部分元素使用默认样式。') } }).catch(error => { if (error?.name !== 'AbortError') setNotice('主题计算暂时不可用。') })
    return () => controller.abort()
  }, [compute, themeTokens, doc?.seq])
  const renderDocument = useMemo(() => doc && doc.themeId && resolvedTheme && resolvedTheme.source === themeTokens ? { ...doc, themes: { ...doc.themes, [doc.themeId]: { ...doc.themes[doc.themeId], tokens: resolvedTheme.tokens } } } : doc, [doc, resolvedTheme, themeTokens])
  const selectPage = useCallback((value: string) => { flushText(); setEditingId(null); setSelected([]); setPageId(value); if (kind === 'design' && doc?.pages[value] && viewportRef.current) { const p = doc.pages[value]; viewportRef.current.scrollTo({ left: Math.max(0, (p.x - origin.x) * scale), top: Math.max(0, (p.y - origin.y) * scale), behavior: 'instant' }) } }, [doc, kind, origin, scale, flushText])
  useEffect(() => { if (current) void session.ensurePage(current.id); for (const value of visibleBoards) void session.ensurePage(value) }, [current?.id, visibleBoards, session, state.loadedPageIds])
  const contextCallback = useRef(onEditorContext); contextCallback.current = onEditorContext
  useEffect(() => {
    if (!visible || !doc) return
    const context: SlideEditorContext = { slideId: current?.id ?? null, selectedElementIds: selected, selectedText: selectedNodes.map(node => node.text ?? node.source ?? '').join('\n').slice(0, 16000), selection: selectedNodes.map(node => ({ id: node.id, kind: node.type, label: (node.text ?? node.source ?? node.type).slice(0, 2000) })), slideTitle: current?.title ?? '', slideIndex: current ? doc.pageOrder.indexOf(current.id) + 1 : 0, slideCount: doc.pageOrder.length, selectedSlides: current ? [current.id] : [], mode: presenting ? 'present' : 'edit', dirty: state.pending > 0 || draftCount > 0, version: String(doc.seq) }
    if (contextCallback.current) contextCallback.current(context)
    else { const controller = new AbortController(); void http(`/artifacts/${encodeURIComponent(artifactId)}/editor-context`, { method: 'PUT', body: JSON.stringify(context), signal: controller.signal }).catch(() => { if (!controller.signal.aborted) setNotice('编辑上下文尚未同步，请稍后再发送。') }); return () => controller.abort() }
  }, [doc, current, selected, state.pending, draftCount, presenting, visible, artifactId])
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
    if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type)) { setNotice('请选择 PNG、JPEG、WebP、GIF 或 SVG 图片。'); return }
    const target = replaceImage.current && primary?.type === 'image' ? primary : null; replaceImage.current = false; const base = session.getSnapshot().document!
    try { const asset = await http<ArtifactAsset>(`/artifacts/${encodeURIComponent(artifactId)}/assets?name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file, headers: { 'content-type': file.type } }); const node = { ...createNode('image', id()), assetId: asset.id, text: file.name }; if (target) { session.dispatch([{ type: 'asset.set', asset }, { type: 'node.patch', pageId: current.id, nodeId: target.id, patch: { assetId: asset.id, text: file.name }, unset: ['crop'] }], base); setSelected([target.id]) } else { dispatch([{ type: 'asset.set', asset }, { type: 'node.insert', pageId: current.id, node }]); setSelected([node.id]) } } catch { setNotice('图片尚未上传，请重试。') }
  }
  const deleteSelection = () => { if (current && writable) { flushText(); setEditingId(null); dispatch(selected.map(nodeId => ({ type: 'node.delete', pageId: current.id, nodeId }))); setSelected([]) } }
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
    const group = { ...createNode('group', id()), x, y, width: Math.max(...selectedNodes.map(node => node.x + node.width)) - x, height: Math.max(...selectedNodes.map(node => node.y + node.height)) - y, layout: { mode: 'absolute' as const } }
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
  async function doExport(format: 'html' | 'pdf' | 'pptx') {
    flushText(); setEditingId(null); setNotice(''); const controller = new AbortController(); exportingAbort.current = controller; setExporting('正在准备导出')
    try { await session.flush(); const snapshot = await session.exportSnapshot(controller.signal); let document = snapshot.document; if (!document) return; { const { captureEmbedPreviews } = await import('./capture-embeds'); document = await captureEmbedPreviews(document, controller.signal, snapshot.pageVersions) } const { exportArtifact } = await import('./export-artifact'); const result = await exportArtifact(document, { format, resolveAsset: (asset, signal) => fetchArtifactAsset(asset, artifactId, signal), signal: controller.signal, onProgress: (done, total) => setExporting(`正在导出 ${done}/${total}`) }); if (!controller.signal.aborted) { download(result.blob, result.filename); setNotice(result.warnings.join('；')) } }
    catch (error) { if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : '导出失败，请重试。') }
    finally { exportingAbort.current = null; setExporting('') }
  }
  const navigatePresentation = (direction: number) => { if (!doc) return; const pages = doc.pageOrder.filter(value => !doc.pages[value].skip); const index = pages.indexOf(pageId ?? ''); if (pages[index + direction]) selectPage(pages[index + direction]) }
  function pointerDown(event: ReactPointerEvent, page: ArtifactPage, resize = false) {
    if (presenting || event.button > 1) return
    if (event.button === 1 || space.current) { event.preventDefault(); gesture.current = { base: session.getSnapshot().document!, type: 'pan', startX: event.clientX, startY: event.clientY, pageId: page.id, nodes: [], moved: false, scrollX: viewportRef.current?.scrollLeft, scrollY: viewportRef.current?.scrollTop }; event.currentTarget.setPointerCapture(event.pointerId); return }
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-node-id]')
    if ((event.target as HTMLElement).closest('button,input,textarea,[contenteditable="true"],.native-text-tools')) return
    flushText(); setEditingId(null); setPageId(page.id)
    const node = target ? page.nodes[target.dataset.nodeId ?? ''] : undefined
    let next = selected
    if (node) { next = event.shiftKey ? selected.includes(node.id) ? selected.filter(value => value !== node.id) : [...selected, node.id] : selected.includes(node.id) && current?.id === page.id ? selected : [node.id]; setSelected(next) }
    else { next = []; setSelected([]) }
    if (!writable) return
    const nodes = next.flatMap(value => page.nodes[value] && !page.nodes[value].locked ? [page.nodes[value]] : [])
    gesture.current = { base: session.getSnapshot().document!, type: resize ? 'resize' : node ? 'move' : 'marquee', startX: event.clientX, startY: event.clientY, pageId: page.id, nodes, moved: false }
    event.preventDefault()
  }
  function pointerMove(event: ReactPointerEvent) {
    const active = gesture.current; if (!active) return
    const dx = (event.clientX - active.startX) / scale, dy = (event.clientY - active.startY) / scale
    if (Math.hypot(dx, dy) > 3) { active.moved = true; if (!event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId) }
    if (active.type === 'pan') { viewportRef.current?.scrollTo((active.scrollX ?? 0) - (event.clientX - active.startX), (active.scrollY ?? 0) - (event.clientY - active.startY)); return }
    if (active.type === 'marquee') { const rect = (event.currentTarget as HTMLElement).getBoundingClientRect(); setMarquee({ x: (Math.min(active.startX, event.clientX) - rect.left) / scale, y: (Math.min(active.startY, event.clientY) - rect.top) / scale, width: Math.abs(dx), height: Math.abs(dy) }); return }
    setPreview({ dx, dy, resize: active.type === 'resize' })
    for (const node of active.nodes) { const element = viewportRef.current?.querySelector<HTMLElement>(`[data-page-id="${active.pageId}"] [data-node-id="${node.id}"]`); if (!element) continue; if (active.type === 'move') element.style.translate = `${dx}px ${dy}px`; else { element.style.width = `${Math.max(16, node.width + dx)}px`; element.style.height = `${Math.max(16, node.height + dy)}px` } }
  }
  function pointerUp(event: ReactPointerEvent, cancel = false) {
    const active = gesture.current; if (!active) return
    gesture.current = null
    const dx = (event.clientX - active.startX) / scale, dy = (event.clientY - active.startY) / scale
    for (const node of active.nodes) { const element = viewportRef.current?.querySelector<HTMLElement>(`[data-page-id="${active.pageId}"] [data-node-id="${node.id}"]`); if (element) { element.style.translate = ''; element.style.width = `${node.width}px`; element.style.height = `${node.height}px` } }
    if (!cancel && active.moved && active.type === 'marquee' && marquee && doc) { const page = doc.pages[active.pageId]; setSelected(page.nodeOrder.filter(value => { const n = page.nodes[value]; return !n.parentId && n.x >= marquee.x && n.y >= marquee.y && n.x + n.width <= marquee.x + marquee.width && n.y + n.height <= marquee.y + marquee.height })) }
    else if (!cancel && active.moved && (active.type === 'move' || active.type === 'resize')) dispatch(active.nodes.map(node => ({ type: 'node.patch', pageId: active.pageId, nodeId: node.id, patch: active.type === 'move' ? { x: Math.round(node.x + dx), y: Math.round(node.y + dy) } : { width: Math.max(16, Math.round(node.width + dx)), height: Math.max(16, Math.round(node.height + dy)) } })), active.base)
    setPreview(null); setMarquee(null)
  }
  if (visible && (!authorized || state.loading) && !state.error) return <div role="status" className="native-loading">正在打开{title}…</div>
  if (!doc) return <div className="native-loading" role="alert">{state.error || '稿件暂时无法打开'}{notice && <p>{notice}</p>}<button type="button" onClick={() => void session.open()}>重试</button><button type="button" onClick={() => void downloadSource()}>下载原始文件</button></div>
  const boardWidth = Math.max(viewport.width, ...doc.pageOrder.map(value => (doc.pages[value].x - origin.x + doc.pages[value].width + 128) * scale))
  const boardHeight = Math.max(viewport.height, ...doc.pageOrder.map(value => (doc.pages[value].y - origin.y + doc.pages[value].height + 128) * scale))
  return <DraftContext.Provider value={drafts}><section ref={editorRoot} className={`native-editor ${presenting ? 'native-presenting' : ''}`} data-native-artifact-editor={kind} data-save-state={state.conflict ? 'conflict' : state.pending ? 'pending' : draftCount ? 'draft' : 'saved'} aria-label={`${title}编辑器`} hidden={!visible} tabIndex={0}
    onKeyDown={event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); flushText(); void session.retry(); return }
      const typing = (event.target as HTMLElement).closest('input,textarea,[contenteditable="true"]')
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !(event.target as HTMLElement).closest('input,textarea') && !event.nativeEvent.isComposing) { event.preventDefault(); flushText(); setEditingId(null); void session.undoRedo(event.shiftKey ? 'redo' : 'undo'); return }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y' && !(event.target as HTMLElement).closest('input,textarea') && !event.nativeEvent.isComposing) { event.preventDefault(); flushText(); setEditingId(null); void session.undoRedo('redo'); return }
      if (typing || event.nativeEvent.isComposing) return
      if (event.key === ' ') { event.preventDefault(); space.current = true }
      if (event.key === 'Escape') { setEditingId(null); if (presenting) { event.preventDefault(); event.stopPropagation(); setPresenting(false) } }
      if (presenting && ['ArrowRight', 'PageDown', 'ArrowLeft', 'PageUp'].includes(event.key)) { event.preventDefault(); navigatePresentation(event.key === 'ArrowRight' || event.key === 'PageDown' ? 1 : -1); return }
      if (!writable) return
      if ((event.ctrlKey || event.metaKey) && event.key === 'a') { event.preventDefault(); setSelected(current?.nodeOrder ?? []) }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); pasteNodes(selectedWithChildren()) }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'g') { event.preventDefault(); event.shiftKey ? ungroup() : groupSelection() }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelection() }
      if (current && selected.length && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); const step = event.shiftKey ? 10 : 1; dispatch(selectedNodes.map(node => ({ type: 'node.patch', pageId: current.id, nodeId: node.id, patch: { x: node.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0), y: node.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0) } }))) }
    }} onKeyUp={event => { if (event.key === ' ') space.current = false }}
    onCopy={event => { if ((event.target as HTMLElement).closest('input,textarea,[contenteditable="true"]')) return; copySelection(); if (clipboard.current.length) { event.clipboardData.setData('application/lingxi-nodes', JSON.stringify(clipboard.current)); event.clipboardData.setData('text/plain', selectedNodes.map(node => node.text ?? node.source ?? '').join('\n')); event.preventDefault() } }}
    onPaste={event => { if ((event.target as HTMLElement).closest('input,textarea,[contenteditable="true"]')) return; const raw = event.clipboardData.getData('application/lingxi-nodes'); if (raw) { try { pasteNodes(JSON.parse(raw)); event.preventDefault() } catch { setNotice('无法粘贴此内容。') } } else if (event.clipboardData.files.length) { void uploadImage(event.clipboardData.files[0]); event.preventDefault() } else if (event.clipboardData.getData('text/plain')) { addNode('text', { text: event.clipboardData.getData('text/plain') }); event.preventDefault() } }}>
    {!presenting && <header className="native-toolbar" aria-label="编辑工具">
      <button type="button" disabled={!state.write || !state.history.undo || state.conflict} onClick={() => { flushText(); setEditingId(null); void session.undoRedo('undo') }} title="撤销，包括 Agent 批次 (Ctrl+Z)">↶ 撤销</button>
      <button type="button" disabled={!state.write || !state.history.redo || state.conflict} onClick={() => { flushText(); setEditingId(null); void session.undoRedo('redo') }} title="重做 (Ctrl+Shift+Z)">↷ 重做</button>
      <span className="native-toolbar-separator" />
      <button type="button" disabled={!writable} onClick={addPage}>＋{kind === 'design' ? '画板' : '页面'}</button>
      <button type="button" disabled={!writable || !current} onClick={() => addNode('text')}>文本</button>
      <button type="button" disabled={!writable || !current} onClick={() => fileInput.current?.click()}>图片</button>
      <select aria-label="插入图形" value="" disabled={!writable || !current} onChange={event => { const shape = event.target.value; if (shape === 'line') addNode('line', { height: 40 }); else addNode('shape', { shape: shape as ArtifactNode['shape'] }) }}><option value="" disabled>图形</option><option value="rect">矩形</option><option value="ellipse">椭圆</option><option value="triangle">三角形</option><option value="diamond">菱形</option><option value="arrow">箭头</option><option value="line">连接线</option></select>
      <button type="button" disabled={!writable || !current} onClick={() => addNode('math')}>公式</button><button type="button" disabled={!writable || !current} onClick={() => addNode('table', { cells: [['标题', '说明'], ['内容', '内容']] })}>表格</button>
      <select aria-label="主题" value={doc.themeId ?? ''} disabled={!writable} onChange={event => dispatch([{ type: 'document.patch', patch: { themeId: event.target.value || null } }])}><option value="">默认主题</option>{Object.values(doc.themes).map(theme => <option value={theme.id} key={theme.id}>{theme.name}</option>)}</select>
      <button type="button" disabled={!current} onClick={() => { flushText(); setEditingId(null); setPresenting(true); setZoom(1) }}>放映</button>
      <select aria-label="导出格式" value="" disabled={!!exporting} onChange={event => void doExport(event.target.value as 'html' | 'pdf' | 'pptx')}><option value="" disabled>导出</option><option value="html">HTML</option><option value="pdf">PDF</option><option value="pptx">PPTX</option></select>
      <button type="button" aria-label="显示属性" aria-pressed={inspectorOpen} onClick={() => setInspectorOpen(value => !value)}>属性</button>
      {Boolean(state.original) && <button type="button" onClick={() => void downloadSource()}>原始文件</button>}<span className="native-save-status" role="status">{!state.write ? '仅查看' : state.conflict ? '有冲突，修改未保存' : state.pending ? `正在保存 ${state.pending} 项修改` : draftCount ? '有未保存的修改' : '已保存'}{agentWorking ? ' · Agent 正在编辑' : ''}</span>
      <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" hidden onChange={event => { const file = event.target.files?.[0]; if (file) void uploadImage(file); event.target.value = '' }} />
    </header>}
    {(state.error || notice || exporting) && <div className="native-notice" role={state.error ? 'alert' : 'status'}>{state.error || notice || exporting}{exporting && <button type="button" onClick={() => exportingAbort.current?.abort()}>取消导出</button>}{state.error && <><button type="button" onClick={() => download(new Blob([JSON.stringify(session.recovery())], { type: 'application/json' }), `${title}.lingxi-recovery.json`)}>下载本地副本</button>{state.conflict ? <button type="button" onClick={() => { download(new Blob([JSON.stringify(session.recovery())], { type: 'application/json' }), `${title}.lingxi-recovery.json`); void session.discardAfterRecovery() }}>保留副本并重新载入</button> : <button type="button" onClick={() => void session.retry()}>重试保存</button>}</>}{notice && <button type="button" onClick={() => setNotice('')}>关闭</button>}</div>}
    <div className="native-workspace">
      {!presenting && <PageStrip document={doc} loadedPageIds={state.loadedPageIds} current={pageId} onSelect={selectPage} onReorder={order => { if (writable) dispatch([{ type: 'pages.reorder', pageIds: order }]) }} />}
      <div className="native-stage" ref={viewportRef} onScroll={event => { const x = event.currentTarget.scrollLeft, y = event.currentTarget.scrollTop; setViewport(value => ({ ...value, x, y })) }} onWheel={event => { if (event.ctrlKey || event.metaKey) { event.preventDefault(); setZoom(value => Math.max(.15, Math.min(4, value * (event.deltaY > 0 ? .9 : 1.1)))) } }}>
        {!doc.pageOrder.length && <div className="native-empty"><p>{kind === 'design' ? '添加第一个画板' : '添加第一页'}</p><button type="button" disabled={!writable} onClick={addPage}>开始编辑</button></div>}
        <div className={`native-board-space ${kind === 'slides' || presenting ? 'native-single-page' : ''}`} style={kind === 'design' && !presenting ? { width: boardWidth, height: boardHeight } : { minWidth: '100%', minHeight: '100%' }}>
          {boards.map(page => <div key={page.id} className={`native-page-shell ${presenting ? `native-transition-${page.transition}` : ''}`} data-page-id={page.id} style={{ width: page.width * scale, height: page.height * scale, ...(kind === 'design' && !presenting ? { position: 'absolute', left: (page.x - origin.x + 64) * scale, top: (page.y - origin.y + 64) * scale } : {}) }}>
            {kind === 'design' && !presenting && <button type="button" className="native-board-label" onClick={() => selectPage(page.id)}>{page.title}</button>}
            <div className="native-page-scaled" style={{ width: page.width, height: page.height, transform: `scale(${scale})` }} onPointerDown={event => pointerDown(event, page)} onPointerMove={pointerMove} onPointerUp={event => pointerUp(event)} onPointerCancel={event => pointerUp(event, true)} onDoubleClick={event => { const target = (event.target as HTMLElement).closest<HTMLElement>('[data-node-id]'); const node = target && page.nodes[target.dataset.nodeId ?? '']; if (node && writable && (node.type === 'text' || node.type === 'table')) { if (editingId === node.id && textPage.current === page.id) return; setPageId(page.id); setSelected([node.id]); textBase.current = session.getSnapshot().document; textPage.current = page.id; setEditingId(node.id) } }}>
              <PageContent document={renderDocument ?? doc} page={page} compute={compute} visibleNodeIds={visibleElements[page.id]?.ids ?? new Set()} contentBottom={visibleElements[page.id]?.bottom} editingId={page.id === pageId ? editingId : null} onTextChange={changeText} onFinishText={finishText} onCellChange={changeCell} onFlowSize={flowSize} presenting={presenting} />
              {!presenting && page.id === pageId && <div className="native-interaction-layer" data-interaction-layer>{selectedNodes.filter(node => node.id !== editingId).map(node => { let x = node.x, y = node.y; let parent = node.parentId ? page.nodes[node.parentId] : undefined; while (parent) { x += parent.x; y += parent.y; parent = parent.parentId ? page.nodes[parent.parentId] : undefined } return <div key={node.id} className="native-selection" style={{ left: x + (preview && !preview.resize ? preview.dx : 0), top: y + (preview && !preview.resize ? preview.dy : 0), width: Math.max(16, node.width + (preview?.resize ? preview.dx : 0)), height: Math.max(16, node.height + (preview?.resize ? preview.dy : 0)), transform: `rotate(${node.rotation}deg)`, borderWidth: 1.5 / scale }}>{writable && !node.locked && <button type="button" className="native-resize-handle" style={{ width: 10 / scale, height: 10 / scale }} aria-label="调整元素大小" onPointerDown={event => { event.stopPropagation(); gesture.current = { base: session.getSnapshot().document!, type: 'resize', startX: event.clientX, startY: event.clientY, pageId: page.id, nodes: selectedNodes.filter(item => !item.locked), moved: false }; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={pointerMove} onPointerUp={event => pointerUp(event)} onPointerCancel={event => pointerUp(event, true)} />}</div> })}{marquee && <div className="native-marquee" style={marquee as CSSProperties} />}</div>}
            </div>
          </div>)}
        </div>
      </div>
      {!presenting && inspectorOpen && <aside className="native-inspector" aria-label="属性面板" onFocusCapture={() => { inspectorBase.current = session.getSnapshot().document }}><fieldset disabled={!writable}>
        {primary ? <><h3>{({ text: '文本', image: '图片', shape: '图形', line: '连接线', table: '表格', svg: 'SVG', math: '公式', group: '组合', embed: '隔离内容' })[primary.type]}</h3>
          <div className="native-field-grid">{(['x', 'y', 'width', 'height', 'rotation'] as const).map(key => <Field key={key} label={({ x: 'X', y: 'Y', width: '宽', height: '高', rotation: '旋转' })[key]} type="number" value={primary[key]} onChange={value => { if (Number.isFinite(Number(value))) patchNode({ [key]: Number(value) }) }} />)}</div>
          <Field label="颜色" type="color" value={artifactResolvedStyle(primary.style, doc).color ?? '#222222'} onChange={value => patchNode({ style: { color: value } }, ['style.themeColor'])} />
          <Field label="填充" type="color" value={artifactResolvedStyle(primary.style, doc).fill ?? '#ffffff'} onChange={value => patchNode({ style: { fill: value } }, ['style.themeFill'])} />
          <Field label="描边" type="color" value={primary.style.stroke ?? '#000000'} onChange={value => patchNode({ style: { stroke: value } })} /><Field label="线宽" type="number" min={0} value={primary.style.strokeWidth ?? 1} onChange={value => patchNode({ style: { strokeWidth: Math.max(0, Number(value)) } })} /><Field label="不透明度" type="number" min={0} max={1} value={primary.style.opacity ?? 1} onChange={value => patchNode({ style: { opacity: Math.max(0, Math.min(1, Number(value))) } })} /><Field label="字体" value={artifactResolvedStyle(primary.style, doc).fontFamily ?? 'sans-serif'} onChange={value => patchNode({ style: { fontFamily: value } }, ['style.themeFont'])} />
          <Field label="字号" type="number" min={1} max={1000} value={primary.style.fontSize ?? 32} onChange={value => patchNode({ style: { fontSize: Math.max(1, Number(value)) } })} />
          <label className="native-field"><span>对齐</span><select value={primary.style.textAlign ?? 'left'} onChange={event => patchNode({ style: { textAlign: event.target.value as 'left' | 'center' | 'right' } })}><option value="left">左</option><option value="center">居中</option><option value="right">右</option></select></label>
          {primary.type === 'math' && <label className="native-textarea"><span>LaTeX 公式</span><TextAreaField key={primary.id} label="LaTeX 公式源码" value={primary.source ?? ''} onCommit={source => patchNode({ source })} /></label>}
          {primary.type === 'image' && <><button type="button" onClick={() => { replaceImage.current = true; fileInput.current?.click() }}>替换图片</button><h4>图片裁剪（0–1）</h4>{(['x', 'y', 'width', 'height'] as const).map(key => <Field key={key} label={key} type="number" min={0} max={1} value={primary.crop?.[key] ?? (key === 'width' || key === 'height' ? 1 : 0)} onChange={value => patchNode({ crop: { x: 0, y: 0, width: 1, height: 1, ...primary.crop, [key]: Math.max(key === 'width' || key === 'height' ? .01 : 0, Math.min(1, Number(value))) } })} />)}</>}
          {primary.type === 'group' && <><button type="button" onClick={ungroup}>取消组合</button><label className="native-field"><span>布局</span><select value={primary.layout?.mode ?? 'absolute'} onChange={event => patchNode({ layout: { ...primary.layout, mode: event.target.value as 'absolute' | 'flex' | 'grid' } })}><option value="absolute">自由布局</option><option value="flex">弹性布局</option><option value="grid">网格</option></select></label></>}
          {primary.type === 'table' && <div className="native-inspector-actions"><button type="button" onClick={() => patchNode({ cells: [...(primary.cells ?? []), (primary.cells?.[0] ?? ['', '']).map(() => '')] })}>添加行</button><button type="button" onClick={() => patchNode({ cells: primary.cells?.map(row => [...row, '']) })}>添加列</button></div>}
          <label className="native-check"><input type="checkbox" checked={primary.locked ?? false} onChange={event => patchNode({ locked: event.target.checked })} />锁定</label>
          <button type="button" onClick={() => { if (current) inspectDispatch([{ type: 'nodes.reorder', pageId: current.id, nodeIds: [...current.nodeOrder.filter(value => value !== primary.id), primary.id] }]) }}>置于顶层</button>
        </> : selected.length > 1 ? <><h3>已选 {selected.length} 个元素</h3><button type="button" onClick={groupSelection}>组合</button></> : current ? <><h3>{kind === 'slides' ? '页面' : '画板'}</h3>{kind === 'design' && <div className="native-field-grid">{(['x', 'y'] as const).map(axis => <Field key={axis} label={`画板 ${axis.toUpperCase()}`} type="number" value={current[axis]} onChange={value => { if (Number.isFinite(Number(value))) inspectDispatch([{ type: 'page.patch', pageId: current.id, patch: { [axis]: Number(value) } }]) }} />)}</div>}<label className="native-field"><span>纸张</span><select aria-label="页面尺寸" value={current.paper ?? 'custom'} onChange={event => { const paper = event.target.value as 'A4' | 'Letter' | 'custom'; inspectDispatch([{ type: 'page.patch', pageId: current.id, patch: { paper, ...(paper === 'A4' ? { width: 794, height: 1123 } : paper === 'Letter' ? { width: 816, height: 1056 } : {}) } }]) }}><option value="custom">自定义</option><option value="A4">A4</option><option value="Letter">信纸</option></select></label><label className="native-field"><span>页面高度</span><select aria-label="页面高度模式" value={current.sizing ?? 'fixed'} onChange={event => inspectDispatch([{ type: 'page.patch', pageId: current.id, patch: { sizing: event.target.value as 'fixed' | 'flow' } }])}><option value="fixed">固定</option><option value="flow">随内容增长</option></select></label><Field label="标题" value={current.title} onChange={value => inspectDispatch([{ type: 'page.patch', pageId: current.id, patch: { title: value } }])} /><Field label="宽" type="number" value={current.width} onChange={value => inspectDispatch([{ type: 'page.patch', pageId: current.id, patch: { width: Math.max(1, Number(value)) } }])} /><Field label="高" type="number" value={current.height} onChange={value => inspectDispatch([{ type: 'page.patch', pageId: current.id, patch: { height: Math.max(1, Number(value)) } }])} /><Field label="背景" type="color" value={artifactPageBackground(current, doc)} onChange={value => inspectDispatch([{ type: 'page.patch', pageId: current.id, patch: { background: value }, unset: ['themeBackground'] }])} /><label className="native-check"><input type="checkbox" checked={current.skip} onChange={event => inspectDispatch([{ type: 'page.patch', pageId: current.id, patch: { skip: event.target.checked } }])} />放映时跳过</label><label className="native-field"><span>转场</span><select value={current.transition} onChange={event => inspectDispatch([{ type: 'page.patch', pageId: current.id, patch: { transition: event.target.value as 'none' | 'fade' | 'slide' } }])}><option value="none">无</option><option value="fade">淡入</option><option value="slide">滑入</option></select></label><button type="button" onClick={() => { inspectDispatch([{ type: 'page.delete', pageId: current.id }]); setSelected([]) }}>删除页面</button></> : null}
        {selected.length > 0 && <><h4>排列</h4><div className="native-inspector-actions">{(['left', 'center', 'right', 'top', 'middle', 'bottom'] as const).map(direction => <button type="button" key={direction} onClick={() => align(direction)}>{({ left: '左对齐', center: '水平居中', right: '右对齐', top: '顶部', middle: '垂直居中', bottom: '底部' })[direction]}</button>)}<button type="button" onClick={deleteSelection}>删除元素</button><button type="button" onClick={() => pasteNodes(selectedWithChildren())}>复制元素</button></div></>}
      </fieldset></aside>}
    </div>
    {!presenting && <footer className="native-footer"><label>缩放 <select aria-label="画布缩放" value={zoom} onChange={event => setZoom(Number(event.target.value))}>{[.25,.5,.75,1,1.25,1.5,2,3,4].map(value => <option key={value} value={value}>{Math.round(value * 100)}%</option>)}{![.25,.5,.75,1,1.25,1.5,2,3,4].includes(zoom) && <option value={zoom}>{Math.round(zoom * 100)}%</option>}</select></label><span>{current ? `${doc.pageOrder.indexOf(current.id) + 1} / ${doc.pageOrder.length}` : ''}</span>{current && <label className="native-notes"><span>备注</span><TextAreaField key={current.id} label="讲者备注" value={current.notes} disabled={!writable} placeholder="添加讲者备注" onFocus={() => { notesBase.current = session.getSnapshot().document }} onCommit={notes => { dispatch([{ type: 'page.patch', pageId: current.id, patch: { notes } }], notesBase.current ?? undefined); notesBase.current = session.getSnapshot().document }} /></label>}</footer>}
    {presenting && <div className="native-present-controls"><button type="button" onClick={() => navigatePresentation(-1)}>上一页</button><span>{current ? doc.pageOrder.indexOf(current.id) + 1 : 0} / {doc.pageOrder.length}</span><button type="button" onClick={() => navigatePresentation(1)}>下一页</button><button type="button" onClick={() => setPresenting(false)}>退出放映</button></div>}
  </section></DraftContext.Provider>
}
