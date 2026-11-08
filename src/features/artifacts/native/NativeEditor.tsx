import {BoardTitle} from './BoardTitle'
import {boardBounds} from '../../../../shared/artifact-board-transform'
import {useBoardTransforms,BoardTransformHandles,BoardSpacingGuides} from './board-transforms'
import {pageRadiusCss} from '../../../../shared/artifact-page-radius'
import SpeakerAccessRecovery from './SpeakerAccessRecovery'
import SpeakerNotesField from './SpeakerNotesField'
import { SpeakerNoteDraftStore } from './speaker-note-drafts'
import {BoardPreviewLoading} from './BoardPreviewLoading'
import {BoardExportMenu,type BoardExportChoice} from './BoardExportMenu'
import type {BoardPreviewView} from './BoardPreview'
import {fitDesignCamera,designFitBounds} from './canvas-fit'
import {usePenPreview} from './use-pen-preview'
import type {CanvasPenHandle,VectorStart} from './CanvasPenTool'
import type {CanvasPointHandle,PointView} from './CanvasPointEditor'
import type {VectorEditBase} from './vector-edit-drafts'
import type {VectorNodePatch} from './vector-node-geometry'
import {VectorEditDraftStore} from './vector-edit-drafts'
import type {PenGeometry} from '../../../../shared/artifact-pen'
import {resolvedPadding} from '../../../../shared/artifact-appearance'
import {designPageLink,readDesignLink} from '../../../../shared/artifact-links'
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { http } from '@/api/core/http'
import { ws } from '@/api/core/realtime'
import { createNode, createPage, type ArtifactAsset, type ArtifactDocument, type ArtifactNode, type ArtifactNodeType, type ArtifactPage, type ArtifactRichText } from '../../../../shared/artifact-document'
import type { ArtifactOperation } from '../../../../shared/artifact-operations'
import { artifactPageBackground, artifactResolvedStyle } from '../../../../shared/artifact-themes'
import { resizeFlowManifest } from '../../../../shared/design-flow-size'
import type { SlideEditorContext } from '../../../../shared/slides-editor-context'
import { createTableNode } from '../../../../shared/artifact-tables'
import { canvasPages, canvasPageOf, canvasContentOwner, createCanvasPage, renameCanvasPage, deleteCanvasPage, createCanvasContents, artifactPageIds, MAX_CANVAS_PAGES } from '../../../../shared/artifact-canvas-pages'
import { NativeCompute } from './compute'
import { NativeDocumentSession,type NativeCodeDraftAccess } from './session'
import { nativeTransport } from './transport'
import { fetchArtifactAsset } from './assets'
import { createAssetReads } from './asset-reads'
import { designPlaybackGroups } from './canvas-playback'
import { ArtifactAssetReadContext } from './asset-read-context'
import { PageContent,NaturalNoteMeasurements,applyCodeStyle } from './renderer'
import { useVisibleElements } from './use-visibility'
import { elementBounds } from './visibility'
import {createCanvasText,canvasFontPatch} from '../../../../shared/artifact-canvas-typography'
import {NaturalLayouts,withNaturalLayout,naturalMeasurementBatch,isNaturalText} from './natural-layout'
import {cameraScroll,worldCamera,type CanvasPoint} from './canvas-camera'
import { editorError, nodeTypeLabels, resizeHandleLabels } from './editor-copy'
import { NativeDrafts } from './drafts'
import { CommentDraftStore } from './comment-drafts'
import {VectorDraftStore} from './vector-drafts'
import { DraftContext } from './draft-context'
import type { ThemeTokens } from './compute'
import { IconButton, Menu, MenuItem, Modal, EditorIcon, ToolbarTools } from './EditorPrimitives'
import { PageThumbnail } from './thumbnail'
import { EditorPaletteContext, EditorColorSessionContext } from './ColorField'
import { readNodeFrame, anchorInFrame, pointInFrame, type RenderedNodeFrame } from './rendered-geometry'
import {useCodeSelection,paintedCodeNode} from './use-code-selection'
import {readElementPositionPins,elementMoveValues,elementMovePatch,elementNudgePatch,elementResizePatch,type ElementPositionPins} from './element-positioning'
import { PageRail } from './PageRail'
import { duplicateNodes, duplicatePages, distributeNodes, resizeSelection, drawingNode, canvasShapeNode, ungroupNodes, appendDrawingPoint, appendCanvasPenPoint, canvasPenNode, layoutSlide, SLIDE_LAYOUTS, type ResizeHandle } from '../../../../shared/artifact-editor-actions'
import { decodeCommentAnchor, commentPoint, commentAnchorAtPoint, type NativeCommentAnchor } from '../../../../shared/artifact-comment-anchor'
import type { EditorComment } from './CommentsPanel'
import type { ArtifactExportFormat } from './export-artifact'
import './native-editor.css'
const VersionHistory=lazy(()=>import('./VersionHistory'))
const CommentsPanel = lazy(() => import('./CommentsPanel'))
const CropEditor = lazy(() => import('./CropEditor'))

const id = () => crypto.randomUUID()
const EMPTY_BOARDS:string[]=[]
function download(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30_000) }
function initialCanvasZoom(pages: Array<Pick<ArtifactPage,'x'|'y'|'width'|'height'>>, width: number, height: number) {
  return (fitDesignCamera(pages,[],width,height)?.scale??.5)*2
}
type CanvasView={zoom:number;x?:number;y?:number}
interface Gesture { base: ArtifactDocument; type: 'move' | 'resize' | 'marquee' | 'pan' | 'draw' | 'rotate'; startX: number; startY: number; pageId: string; nodes: ArtifactNode[]; moved: boolean; handle?: ResizeHandle; points?: Array<{ x: number; y: number }>; tool?: string; angle?: number; scope?: 'canvas'|'artboard'; canvas?:boolean; scrollX?: number; scrollY?: number; positionPins?:Record<string,ElementPositionPins> }
function editorOwnsEvent(root:HTMLElement,target:EventTarget|null) {
  return target instanceof Element&&target.closest('[data-native-artifact-editor],[data-native-editor-boundary]')===root
}
let penModule:Promise<typeof import('../../../../shared/artifact-pen')>|undefined
let vectorModule:Promise<typeof import('./CanvasPenTool')>|undefined
let pointModule:Promise<typeof import('./CanvasPointEditor')>|undefined
interface Props { revisionSeq?:string; artifactId: string; kind: 'design' | 'slides'; title: string; visible?: boolean; agentWorking?: boolean; exitPresentation?: number; onEditorContext?(context: SlideEditorContext): void }
export default function NativeEditor({ revisionSeq, artifactId, kind, title, visible = true, agentWorking = false, exitPresentation = 0, onEditorContext }: Props) {
  const session = useMemo(() => new NativeDocumentSession(nativeTransport(artifactId,revisionSeq)), [artifactId,revisionSeq])
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const retainedDrafts=session.hasRetainedDrafts
  const drafts = useMemo(() => new NativeDrafts(), [artifactId])
  const draftCount = useSyncExternalStore(drafts.subscribe, drafts.getSnapshot)
  const flushText = useCallback(() => drafts.flush(), [drafts])
  const saveDocument=useCallback(()=>{drafts.flush('save');void session.retry()},[drafts,session])
  const doc = state.document
  const compute = useMemo(() => new NativeCompute(), [artifactId])
  const assetReads = useMemo(() => createAssetReads(fetchArtifactAsset), [artifactId])
  const [authorized, setAuthorized] = useState(false)
  const [pageId, setPageId] = useState<string | null>(null)
  const [canvasPageId,setCanvasPageId]=useState<string|null>(()=>{const link=readDesignLink(new URLSearchParams(window.location.search));return kind==='design'&&link?.artifactId===artifactId?link.canvasPageId??null:null})
  const canvasViews=useRef(new Map<string,CanvasView>()),pendingCanvasView=useRef<CanvasView|null>(null),pendingCanvasFit=useRef<string|null>(null)
  const canvasDialogBase=useRef<ArtifactDocument|null>(null)
  const [canvasDialogId,setCanvasDialogId]=useState<string|null>(null),[canvasDialogError,setCanvasDialogError]=useState(''),[canvasDeleting,setCanvasDeleting]=useState(false)
  const canvasSheets=useMemo(()=>canvasPages(doc??{}),[doc?.canvasPages])
  const activeCanvasId=canvasSheets.find(sheet=>sheet.id===canvasPageId)?.id??canvasSheets[0].id
  const canvasContentId=kind==='design'?canvasSheets.find(sheet=>sheet.id===activeCanvasId)?.contentId:undefined
  const canvasContent=canvasContentId?doc?.pages[canvasContentId]:undefined
  const naturalLayouts=useRef(new NaturalLayouts()),[naturalRevision,setNaturalRevision]=useState(0)
  const naturalSizes=useMemo(()=>canvasContentId?naturalLayouts.current.forPage(canvasContentId):undefined,[canvasContentId])
  const onNaturalLayout=useCallback(()=>setNaturalRevision(value=>value+1),[])
  const renderedCanvasContent=useMemo(()=>canvasContent?withNaturalLayout(canvasContent,naturalSizes,doc??undefined):undefined,[canvasContent,naturalSizes,naturalRevision,doc])
  const naturalMeasurements=useMemo(()=>visible&&authorized?naturalMeasurementBatch(canvasContent,naturalSizes,doc??undefined):[],[visible,authorized,canvasContent,naturalSizes,doc,naturalRevision])
  const boardIds=useMemo(()=>doc?.pageOrder.filter(id=>kind!=='design'||canvasPageOf(doc.pages[id])===activeCanvasId)??[],[doc,kind,activeCanvasId])
  const lastFocusedBoard=useRef<string|null>(null)
  const highlightedBoard=boardIds.includes(pageId??'')?pageId:boardIds.includes(lastFocusedBoard.current??'')?lastFocusedBoard.current:boardIds[0]
  useLayoutEffect(()=>{if(pageId&&boardIds.includes(pageId))lastFocusedBoard.current=pageId},[pageId,boardIds])
  const playbackGroups=useMemo(()=>designPlaybackGroups(kind==='design'?boardIds.map(id=>doc!.pages[id]):[]),[kind,boardIds,doc])
  const freeBounds=useMemo(()=>renderedCanvasContent?elementBounds(renderedCanvasContent):[],[renderedCanvasContent])
  const fitAnnotationBounds=useMemo(()=>renderedCanvasContent?elementBounds(renderedCanvasContent,false):[],[renderedCanvasContent])
  const [selected, setSelected] = useState<string[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [focusedBoardId,setFocusedBoardId]=useState<string|null>(null),[BoardPreview,setBoardPreview]=useState<typeof import('./BoardPreview').default|null>(null)
  const boardPreviewViewport=useRef<HTMLDivElement>(null),[boardPreviewView,setBoardPreviewView]=useState<BoardPreviewView>({scale:1,width:0,height:0})
  const [presenting, setPresenting] = useState(false)
  const [speakerWindow,setSpeakerWindow]=useState<Window|null>(null)
  const [presentationFullscreen,setPresentationFullscreen]=useState<{deferred:boolean;request:Promise<boolean>|null;since:number;warning?:string}>({deferred:false,request:null,since:0})
  const fullscreenOwner=useRef<object|null>(null)
  useEffect(()=>{
    if(!presentationFullscreen.since)return
    const token={};fullscreenOwner.current=token
    const close=()=>{if(fullscreenOwner.current===token&&window.document.fullscreenElement)void window.document.exitFullscreen().catch(()=>{})}
    if(!presenting){close();void presentationFullscreen.request?.then(close)}
    return()=>queueMicrotask(()=>{close();void presentationFullscreen.request?.then(close)})
  },[presenting,presentationFullscreen])
  const [coarsePointer,setCoarsePointer]=useState(()=>window.matchMedia('(pointer:coarse)').matches)
  useEffect(()=>{const query=window.matchMedia('(pointer:coarse)'),update=()=>setCoarsePointer(query.matches);query.addEventListener('change',update);return()=>query.removeEventListener('change',update)},[])
  useEffect(()=>{if(!speakerWindow)return;const closed=()=>setSpeakerWindow(null);speakerWindow.addEventListener('pagehide',closed);return()=>speakerWindow.removeEventListener('pagehide',closed)},[speakerWindow])
  useEffect(()=>()=>{speakerWindow?.close()},[speakerWindow])
  const [SlidesPresentation,setSlidesPresentation]=useState<typeof import('./SlidesPresentation').default|null>(null)
  useEffect(()=>{if((!presenting&&!speakerWindow)||SlidesPresentation)return;let active=true;void import('./SlidesPresentation').then(module=>{if(active)setSlidesPresentation(()=>module.default)}).catch(()=>{if(active){setPresenting(false);speakerWindow?.close();setNotice('放映组件未能加载，请刷新页面后重试。')}});return()=>{active=false}},[presenting,speakerWindow,SlidesPresentation])
  const [zoom, setZoom] = useState(1)
  const [cameraRequest,setCameraRequest]=useState(0)
  const [viewport, setViewport] = useState({ width: 0, height: 0, x: 0, y: 0 })
  const [visibleBoardResult, setVisibleBoardResult] = useState<{key:string;ids:string[]}>({key:'',ids:[]})
  const [preview, setPreview] = useState<{ dx: number; dy: number; resize?: boolean; frames?:Record<string,Pick<ArtifactNode,'x'|'y'|'width'|'height'>> } | null>(null)
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [exporting, setExporting] = useState('')
  const [notice, setNotice] = useState('')
  const [announcement,setAnnouncement]=useState({id:0,text:''})
  const [outlineHeight,setOutlineHeight]=useState(168)
  const [inspectorWidth,setInspectorWidth]=useState(336)
  const [inspectorTab, setInspectorTab] = useState<'properties'|'outline'|'code'|'theme'>('properties')
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const closeInspector=()=>{setInspectorOpen(false);queueMicrotask(()=>editorRoot.current?.querySelector<HTMLElement>('[aria-label="显示属性"]')?.focus({preventScroll:true}))}
  const [NativeInspector,setNativeInspector]=useState<typeof import('./NativeInspector').default|null>(null)
  useEffect(()=>{
    if(!inspectorOpen||NativeInspector)return
    let active=true
    void import('./NativeInspector').then(module=>{if(active)setNativeInspector(()=>module.default)}).catch(()=>{
      if(active){setInspectorOpen(false);setNotice('属性面板未能加载，请刷新页面后重试。');queueMicrotask(()=>editorRoot.current?.querySelector<HTMLElement>('[aria-label="显示属性"]')?.focus({preventScroll:true}))}
    })
    return()=>{active=false}
  },[inspectorOpen,NativeInspector])
  const [resolvedTheme, setResolvedTheme] = useState<{ source: ThemeTokens; tokens: ThemeTokens } | null>(null)
  const [tool, setTool] = useState('select')
  const [pointEditing,setPointEditing]=useState<{pageId:string;nodeId:string}|null>(null)
  const pointEditor=useRef<CanvasPointHandle|null>(null),[CanvasPointTool,setCanvasPointTool]=useState<typeof import('./CanvasPointEditor').default|null>(null)
  useEffect(()=>{if(tool!=='select')setPointEditing(null)},[tool])
  useEffect(()=>{
    if(!visible||!pointEditing||CanvasPointTool)return
    let active=true;pointModule??=import('./CanvasPointEditor')
    void pointModule.then(module=>{if(active){setCanvasPointTool(()=>module.default);setNotice(value=>value==='正在加载控制点工具…'?'':value)}}).catch(()=>{if(active){setPointEditing(null);setNotice('控制点工具未能加载，请刷新页面后重试。')}})
    return()=>{active=false}
  },[visible,pointEditing,CanvasPointTool])
  const [lastDrawingTool,setLastDrawingTool]=useState<'pencil'|'pen'>('pencil')
  useEffect(()=>{if(tool==='pencil'||tool==='pen')setLastDrawingTool(tool)},[tool])
  const vectorTool=useRef<CanvasPenHandle|null>(null),[CanvasVectorTool,setCanvasVectorTool]=useState<typeof import('./CanvasPenTool').default|null>(null),[vectorLoadFailed,setVectorLoadFailed]=useState(false)
  useEffect(()=>{
    if(!visible||tool!=='pen'||CanvasVectorTool)return
    let active=true;vectorModule??=import('./CanvasPenTool')
    void vectorModule.then(module=>{if(active){setCanvasVectorTool(()=>module.default);setNotice(value=>value==='正在加载钢笔工具…'?'':value)}}).catch(()=>{if(active){setVectorLoadFailed(true);setNotice('钢笔工具未能加载，请刷新页面后重试。')}})
    return()=>{active=false}
  },[visible,tool,CanvasVectorTool])
  const penFitter=useRef<typeof import('../../../../shared/artifact-pen')|null>(null),[penLoading,setPenLoading]=useState(false),[penLoadFailed,setPenLoadFailed]=useState(false)
  useEffect(()=>{
    if(!visible||tool!=='pencil'||penFitter.current){setPenLoading(false);return}
    let active=true;setPenLoading(true);setPenLoadFailed(false)
    penModule??=import('../../../../shared/artifact-pen')
    void penModule.then(module=>{if(active){penFitter.current=module;setPenLoading(false);setNotice(value=>value==='正在加载绘图工具…'?'':value)}}).catch(()=>{if(active){setPenLoading(false);setPenLoadFailed(true);setNotice('绘图工具未能加载，请刷新页面后重试。')}})
    return()=>{active=false}
  },[tool,visible])

  const [shapeTool, setShapeTool] = useState<ArtifactNode['shape']>('rect')
  const [view, setView] = useState<'slide' | 'grid' | 'canvas'>('slide')
  const [railOpen, setRailOpen] = useState(true), [notesOpen, setNotesOpen] = useState(false)
  const [compactRailOpen, setCompactRailOpen] = useState(false)
  const [layersOpen, setLayersOpen] = useState(false), [guidesOpen, setGuidesOpen] = useState(true)
  const [selectedPages, setSelectedPages] = useState<string[]>([])
  const pageSelectionAnchor=useRef<string|null>(null)
  const [dialog, setDialog] = useState<'layouts' | 'section' | 'rename' | 'canvas-rename' | 'canvas-delete' | null>(null), [dialogText, setDialogText] = useState('')
  const [historyOpen,setHistoryOpen]=useState(false)
  const historyAnchor=useRef<HTMLSpanElement>(null),boardHistoryAnchor=useRef<HTMLSpanElement>(null)
  const closeHistory=useCallback((restoreFocus=false)=>{setHistoryOpen(false);if(restoreFocus)queueMicrotask(()=>(focusedBoardId?boardHistoryAnchor:historyAnchor).current?.querySelector('button')?.focus())},[focusedBoardId])
  const [commentsOpen, setCommentsOpen] = useState(false), [commentAnchor, setCommentAnchor] = useState<NativeCommentAnchor | null>(null)
  const commentAttachment=useRef<HTMLSpanElement>(null)
  const [activeCommentThread,setActiveCommentThread]=useState<string|null>(null)
  const [commentAttachmentPoint,setCommentAttachmentPoint]=useState<{x:number;y:number}|null>(null)
  const vectorDrafts=useMemo(()=>new VectorDraftStore(),[artifactId]),vectorDraftToken=useRef(Symbol('vector-drafts'))
  useSyncExternalStore(vectorDrafts.subscribe,vectorDrafts.getSnapshot)
  useLayoutEffect(()=>drafts.register(vectorDraftToken.current,()=>{}),[drafts])
  useLayoutEffect(()=>vectorDrafts.subscribe(()=>drafts.mark(vectorDraftToken.current,vectorDrafts.size>0)),[vectorDrafts,drafts])
  const vectorEditDrafts=useMemo(()=>new VectorEditDraftStore(),[artifactId]),vectorEditDraftToken=useRef(Symbol('vector-edit-drafts'))
  useSyncExternalStore(vectorEditDrafts.subscribe,vectorEditDrafts.getSnapshot)
  useLayoutEffect(()=>drafts.register(vectorEditDraftToken.current,()=>{}),[drafts])
  useLayoutEffect(()=>vectorEditDrafts.subscribe(()=>drafts.mark(vectorEditDraftToken.current,vectorEditDrafts.size>0)),[vectorEditDrafts,drafts])
  const blockedVectorDrafts=vectorDrafts.blocked||vectorEditDrafts.blocked
  const speakerNoteDrafts=useMemo(()=>new SpeakerNoteDraftStore(),[artifactId,revisionSeq]),speakerDraftToken=useRef(Symbol('speaker-note-drafts'))
  const [speakerNoteError,setSpeakerNoteError]=useState('')
  const blockedSpeakerNotes=(speakerNoteDrafts.size>0||state.pending>0)&&(!state.write||state.conflict)
  const commentDrafts=useMemo(()=>new CommentDraftStore(),[artifactId]),commentDraftToken=useRef(Symbol('comment-drafts'))
  useLayoutEffect(()=>drafts.register(commentDraftToken.current,()=>{}),[drafts])
  useLayoutEffect(()=>commentDrafts.subscribe(()=>drafts.mark(commentDraftToken.current,commentDrafts.size>0)),[commentDrafts,drafts])
  const onCommentDraft=useCallback((key:string,text:string|null)=>{if(text===null)commentDrafts.delete(key);else commentDrafts.set(key,text);drafts.mark(commentDraftToken.current,commentDrafts.size>0)},[commentDrafts,drafts])
  const commentSessionRef=useRef(0),[commentSession,setCommentSession]=useState(0)
  const openComment=useCallback((anchor:NativeCommentAnchor|null,threadId:string|null=null)=>{const token=++commentSessionRef.current;setCommentSession(token);setCommentAnchor(anchor);setActiveCommentThread(threadId);setCommentsOpen(true)},[])
  const closeComments=useCallback((restoreFocus=false)=>{if(commentSession!==commentSessionRef.current)return;setCommentsOpen(false);setCommentAnchor(null);setActiveCommentThread(null);if(restoreFocus){setTool('select');queueMicrotask(()=>editorRoot.current?.querySelector<HTMLButtonElement>('.native-comments-tools [aria-label="评论"]')?.focus())}},[commentSession])

  const [commentThreads, setCommentThreads] = useState<EditorComment[]>([])
  const [croppingFrame,setCroppingFrame]=useState<RenderedNodeFrame|null>(null)
  const [commentPositions,setCommentPositions]=useState<Record<string,{pageId:string;x:number;y:number}>>({})
  const [cropping, setCropping] = useState<ArtifactNode | null>(null)
  const [contextMenu, setContextMenu] = useState<{x:number;y:number}|null>(null)
  const [drawingPreview, setDrawingPreview] = useState<Array<{ x: number; y: number }> | null>(null)
  const canvasMode = (kind === 'design' || view === 'canvas') && !presenting
  const editorRoot = useRef<HTMLElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const replaceImage = useRef(false)
  const gesture = useRef<Gesture | null>(null)
  const pendingComment=useRef<NativeCommentAnchor|null>(null)
  const space = useRef(false)
  const exportingAbort = useRef<AbortController | null>(null)
  const menuRef = useRef<HTMLDivElement>(null),contextReturn=useRef<HTMLElement|null>(null)
  const closeContextMenu=(restore=false)=>{const opener=contextReturn.current;contextReturn.current=null;setContextMenu(null);if(restore)requestAnimationFrame(()=>(opener?.isConnected?opener:editorRoot.current)?.focus({preventScroll:true}))}
  const clipboard = useRef<ArtifactNode[]>([])
  const inspectorBase = useRef<ArtifactDocument | null>(null)
  const textBase = useRef<ArtifactDocument | null>(null)
  const textPage = useRef<string | null>(null)
  const lifetime = useRef<object | null>(null)
  const compactRailFocus=useRef(false)
  useLayoutEffect(()=>{if(!compactRailFocus.current)return;compactRailFocus.current=false;editorRoot.current?.querySelector<HTMLButtonElement>(compactRailOpen ? '.native-footer [aria-label="隐藏页面缩略图"]' : '.native-compact-navigation [aria-label="显示页面缩略图"]')?.focus({preventScroll:true})},[compactRailOpen])
  const toggleCompactRail=(open:boolean)=>{compactRailFocus.current=true;setCompactRailOpen(open)}
  const boardReturnFocus=useRef<string|null>(null),boardReturnElement=useRef<HTMLElement|null>(null),playAnchor=useRef<HTMLSpanElement>(null)
  const openBoardPreview=(value:string,opener?:HTMLElement)=>{boardReturnElement.current=opener??null;flushText();setPointEditing(null);setEditingId(null);setCropping(null);setSelected([]);setPageId(value);setFocusedBoardId(value)}
  const closeBoardPreview=useCallback(()=>{boardReturnFocus.current=focusedBoardId;setFocusedBoardId(null)},[focusedBoardId])
  useLayoutEffect(()=>{if(focusedBoardId||!boardReturnFocus.current)return;const value=boardReturnFocus.current;boardReturnFocus.current=null;(boardReturnElement.current?.isConnected?boardReturnElement.current:editorRoot.current?.querySelector<HTMLButtonElement>(`[data-preview-open="${value}"]`)??editorRoot.current)?.focus({preventScroll:true});boardReturnElement.current=null},[focusedBoardId])
  useEffect(()=>{if(!focusedBoardId||BoardPreview)return;let active=true;void import('./BoardPreview').then(module=>{if(active)setBoardPreview(()=>module.default)}).catch(()=>{if(active){setNotice('全窗口预览未能加载，请刷新页面后重试。');closeBoardPreview()}});return()=>{active=false}},[focusedBoardId,BoardPreview,closeBoardPreview])
  useEffect(()=>{if(focusedBoardId)void session.ensurePage(focusedBoardId)},[focusedBoardId,session,state.loadedPageIds])
  useEffect(()=>{if(focusedBoardId&&doc&&!doc.pages[focusedBoardId])closeBoardPreview()},[focusedBoardId,doc,closeBoardPreview])
  const initialCamera = useRef(false)
  const geometry = useRef(new Map<string, string>())
  const current = doc && pageId && (boardIds.includes(pageId)||pageId===canvasContentId) ? pageId===canvasContentId?renderedCanvasContent:doc.pages[pageId] : undefined
  const compact=viewport.width>0&&viewport.width<640
  const scale = !canvasMode && current ? Math.max(.05, Math.min((viewport.width - (presenting ? 0 : compact ? 16 : 24)) / current.width, (viewport.height - (presenting || compact && !compactRailOpen ? 0 : 104)) / current.height)) * zoom : zoom * .5
  const selectedNodes = useCodeSelection(current,selected,viewportRef,scale)
  const primary = selectedNodes.length === 1 ? selectedNodes[0] : undefined
  const primaryPadding=primary?resolvedPadding(primary.style,primary.type==='note'&&current?.id===canvasContentId?{x:12,y:10}:{x:0,y:0}):undefined
  const palette=useMemo(()=>Array.from(new Set((current?[artifactPageBackground(current,doc!),...current.nodeOrder.flatMap(id=>{const style=artifactResolvedStyle(current.nodes[id].style,doc!);return [style.color,style.fill,style.backgroundColor]})]:[]).filter((c):c is string=>!!c))).slice(0,32),[current,doc?.themeId,doc?.themes])
  const canvasWritable=state.write&&!state.conflict&&!presenting
  const writable = state.write && !state.conflict && !presenting && (!current || state.loadedPageIds.includes(current.id))
  const currentRef = useRef(current); currentRef.current = current
  const selectedRef = useRef(selected); selectedRef.current = selected
  const dispatch = useCallback((ops: ArtifactOperation[], base?: ArtifactDocument) => { try { session.dispatch(ops, base) } catch (error) { setNotice(editorError(error, '无法应用修改，请重试。')) } }, [session])
  const commitCode=useCallback((ops:ArtifactOperation[],base:ArtifactDocument,readKeys:readonly string[]=[])=>{const snapshot=session.getSnapshot();if(!snapshot.write||!snapshot.document){session.retainDraft(ops);return false}try{session.dispatch(ops,base,readKeys);return !session.getSnapshot().conflict}catch(error){setNotice(editorError(error,'无法应用修改，请重试。'));return false}},[session])
  const codeDraftAccess=useMemo<NativeCodeDraftAccess>(()=>({generation:()=>session.codeDraftGeneration,get:(pageId,nodeIds)=>session.getCodeDraft(pageId,nodeIds),retain:draft=>session.retainCodeDraft(draft),clear:(pageId,nodeIds)=>session.clearCodeDraft(pageId,nodeIds),canCommit:pageId=>{const value=session.getSnapshot();return value.write&&!value.conflict&&!!value.document&&value.loadedPageIds.includes(pageId)}}),[session])
  const commitSpeakerNote=useCallback((pageId:string,notes:string,base:ArtifactDocument)=>{
    const snapshot=session.getSnapshot()
    if(snapshot.document?.pages[pageId]?.notes===notes){setSpeakerNoteError('');return true}
    if(!snapshot.write||snapshot.conflict||!snapshot.document)return false
    if(!snapshot.document.pages[pageId]){setSpeakerNoteError('原页面已被移除，本地备注草稿已保留。');return false}
    try{session.dispatch([{type:'page.patch',pageId,patch:{notes}}],base);setSpeakerNoteError('');return true}
    catch(error){setSpeakerNoteError(editorError(error,'备注未能保存，本地草稿已保留，请重试。'));return false}
  },[session])
  useLayoutEffect(()=>{
    const unregister=drafts.register(speakerDraftToken.current,reason=>speakerNoteDrafts.flush(commitSpeakerNote,undefined,reason==='save'))
    const sync=()=>drafts.mark(speakerDraftToken.current,speakerNoteDrafts.size>0)
    const unsubscribe=speakerNoteDrafts.subscribe(sync);sync()
    return()=>{unsubscribe();unregister()}
  },[drafts,speakerNoteDrafts,commitSpeakerNote])
  useEffect(() => { const token = {}; lifetime.current = token; return () => { queueMicrotask(() => { if (lifetime.current === token) { session.dispose(); compute.dispose(); assetReads.dispose(); exportingAbort.current?.abort() } }) } }, [session, compute, assetReads])
  useLayoutEffect(() => { let active = true; setAuthorized(false); if (visible) void session.open().then(() => { if (active) setAuthorized(!!session.getSnapshot().document) }); return () => { active = false } }, [session, visible])
  useEffect(() => { if (!visible) return; const timer = setInterval(() => void session.refresh(), agentWorking ? 700 : 2000); return () => clearInterval(timer) }, [session, visible, agentWorking])
  const refreshComments=useCallback((signal?:AbortSignal)=>http<{threads:EditorComment[]}>(`/artifacts/${encodeURIComponent(artifactId)}/comments`,{signal}).then(value=>{if(!signal?.aborted&&Array.isArray(value.threads))setCommentThreads(value.threads)}),[artifactId])
  useEffect(()=>{if(!visible||!authorized||revisionSeq!==undefined)return;const controller=new AbortController();void refreshComments(controller.signal).catch(()=>{});const stop=ws.on(event=>{if(event.type==='artifact.changed'&&event.artifactId===artifactId)void refreshComments(controller.signal).catch(()=>{})});return()=>{controller.abort();stop()}},[visible,authorized,revisionSeq,refreshComments,artifactId])
  useEffect(() => ws.on(event => { if (event.type === 'artifact.changed' && event.artifactId === artifactId) void session.refresh() }), [session, artifactId])
  useEffect(() => { if (!doc) return; if (!pageId || !boardIds.includes(pageId)&&pageId!==canvasContentId) { setPageId(boardIds[0] ?? null); setSelected([]); setEditingId(null) } }, [doc, pageId, boardIds,canvasContentId])
  useEffect(() => { if (!state.pending && !draftCount && !retainedDrafts) return; const warn = (event: BeforeUnloadEvent) => { flushText(); event.preventDefault(); event.returnValue = '' }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn) }, [state.pending, draftCount, retainedDrafts, flushText])
  useEffect(() => { if (presenting && !SlidesPresentation) editorRoot.current?.focus({ preventScroll: true }) }, [presenting,speakerWindow,SlidesPresentation])
  useEffect(() => { if (exitPresentation) setPresenting(false) }, [exitPresentation])
  useEffect(()=>{if(!state.document&&!state.loading&&state.error)setPresenting(false)},[state.document,state.loading,state.error])
  useLayoutEffect(() => {
    if (!viewportRef.current) return
    const measure = () => { const element = viewportRef.current; if (element) setViewport({ width: element.clientWidth, height: element.clientHeight, x: element.scrollLeft, y: element.scrollTop }) }
    const observer = new ResizeObserver(measure); observer.observe(viewportRef.current); measure(); return () => observer.disconnect()
  }, [doc !== null, presenting, authorized])

  useEffect(() => {
    if (initialCamera.current && pendingCanvasFit.current!==activeCanvasId || !authorized || !doc || canvasContentId&&!state.loadedPageIds.includes(canvasContentId) || !viewport.width || !viewport.height) return
    initialCamera.current = true
    pendingCanvasFit.current = null
    if (kind === 'design') {
      const fit=fitDesignCamera(boardIds.map(id=>doc.pages[id]),fitAnnotationBounds,viewport.width,viewport.height)
      if(fit){pendingCanvasView.current={zoom:fit.scale*2,x:fit.x,y:fit.y};setZoom(fit.scale*2);setCameraRequest(value=>value+1)}
    }
  },[authorized,doc,boardIds,fitAnnotationBounds,canvasContentId,state.loadedPageIds,viewport.width,viewport.height,kind,activeCanvasId])
  const selectedBoardIds=useMemo(()=>selectedPages.filter(id=>boardIds.includes(id)),[selectedPages,boardIds])
  const boardTransforms=useBoardTransforms({document:doc,ids:boardIds,selected:selectedPages,nodeSelected:selected.length>0,enabled:visible&&authorized&&!focusedBoardId&&kind==='design'&&canvasMode&&tool==='select',writable:canvasWritable,scale,
    visibleIds:()=>boards.map(page=>page.id),getDocument:()=>session.getSnapshot().document,ensurePage:async id=>{await session.ensurePage(id);if(!session.getSnapshot().loadedPageIds.includes(id))throw Error('画板内容尚未加载')},select:(id,multiple,range)=>choosePage(id,multiple,range,false),dispatch:(operations,base)=>dispatch(operations,base),notice:setNotice})
  const displayPages = useMemo(()=>doc ? Object.fromEntries(boardIds.map((id,index)=>{const p=doc.pages[id];return [id,kind==='slides' && canvasMode ? {...p,x:index%4*(p.width+80),y:Math.floor(index/4)*(p.height+100)} : boardTransforms.preview.copy||!boardTransforms.preview.frames[id]?p:{...p,...boardTransforms.preview.frames[id]}]})) : {},[doc,boardIds,kind,canvasMode,boardTransforms.preview.frames,boardTransforms.preview.copy])
  const origin = useMemo(() => ({ x: doc ? Math.min(0, ...boardIds.map(value => displayPages[value].x),...freeBounds.map(value=>value.x)) : 0, y: doc ? Math.min(0, ...boardIds.map(value => displayPages[value].y),...freeBounds.map(value=>value.y)) : 0 }), [boardIds, displayPages,freeBounds])
  const canvasExtent = useMemo(()=>({width:doc ? Math.max(0,...boardIds.map(id=>displayPages[id].x-origin.x+displayPages[id].width+128),...freeBounds.map(value=>value.x-origin.x+value.width+128))*scale : 0,height:doc ? Math.max(0,...boardIds.map(id=>displayPages[id].y-origin.y+displayPages[id].height+128),...freeBounds.map(value=>value.y-origin.y+value.height+128))*scale : 0}),[doc,displayPages,origin,scale,freeBounds])
  const fitBounds=useMemo(()=>kind==='design'&&doc?designFitBounds(boardIds.map(id=>doc.pages[id]),fitAnnotationBounds):undefined,[kind,doc,boardIds,fitAnnotationBounds])
  const baseCanvasInset = fitBounds?{x:Math.max(0,viewport.width/2-(fitBounds.left+fitBounds.right)*scale/2-(64-origin.x)*scale),y:54+Math.max(0,(viewport.height-54)/2-(fitBounds.top+fitBounds.bottom)*scale/2-(64-origin.y)*scale)}:{x:Math.max(0,(viewport.width-canvasExtent.width)/2),y:54+20*scale+Math.max(0,(viewport.height-54-canvasExtent.height)/2)}
  const panPadding=canvasMode&&kind==='design'?{x:viewport.width*2,y:viewport.height*2}:{x:0,y:0}
  const canvasInset={x:baseCanvasInset.x+panPadding.x,y:baseCanvasInset.y+panPadding.y}
  const boardQuery=useMemo(()=>{
    const rect={x:(viewport.x-canvasInset.x)/scale+origin.x-64,y:(viewport.y-canvasInset.y)/scale+origin.y-64,width:viewport.width/scale+128,height:viewport.height/scale+128}
    return{rect,key:JSON.stringify([boardIds.map(id=>{const p=displayPages[id];return[id,p.x,p.y,p.width,p.height]}),rect])}
  },[boardIds,displayPages,viewport.x,viewport.y,viewport.width,viewport.height,canvasInset.x,canvasInset.y,scale,origin.x,origin.y])
  // A fit-view result must never become a detail-view loading list while the
  // new Worker query is pending. Keep only the result for this exact geometry.
  const visibleBoards=visibleBoardResult.key===boardQuery.key?visibleBoardResult.ids:EMPTY_BOARDS
  const previousCanvasMapping=useRef<{id:string;scale:number;width:number;height:number;x:number;y:number;padX:number;padY:number;world:CanvasPoint;awaitingLayout?:boolean}|null>(null)
  useLayoutEffect(()=>{
    const element=viewportRef.current
    if(!canvasMode||!element)return
    const next={id:activeCanvasId,scale,width:viewport.width,height:viewport.height,x:canvasInset.x+(64-origin.x)*scale,y:canvasInset.y+(64-origin.y)*scale,padX:panPadding.x,padY:panPadding.y},old=previousCanvasMapping.current
    const pending=pendingCanvasView.current
    let target:CanvasPoint|undefined
    if(pending){pendingCanvasView.current=null;target=pending.x!==undefined&&pending.y!==undefined?cameraScroll({x:pending.x,y:pending.y},next):{x:panPadding.x,y:panPadding.y}}
    else if(old?.id===next.id){
      if(old.scale===scale)target=cameraScroll(old.world,next)
      else{const before=cameraScroll(old.world,old);target={x:before.x-old.padX+next.padX,y:before.y-old.padY+next.padY}}
    }else if(!canvasViews.current.has(activeCanvasId))target={x:panPadding.x,y:panPadding.y}
    if(target&&(Math.abs(element.scrollLeft-target.x)>.01||Math.abs(element.scrollTop-target.y)>.01))element.scrollTo({left:target.x,top:target.y,behavior:'instant'})
    previousCanvasMapping.current={...next,awaitingLayout:naturalMeasurements.length>0,world:worldCamera(naturalMeasurements.length>0&&target?target:{x:element.scrollLeft,y:element.scrollTop},next)}
  },[activeCanvasId,canvasMode,scale,viewport.width,viewport.height,origin.x,origin.y,canvasInset.x,canvasInset.y,panPadding.x,panPadding.y,canvasExtent.width,canvasExtent.height,naturalMeasurements.length,cameraRequest])
  useEffect(() => {
    if (!doc) return
    const upserts = boardIds.flatMap(value => { const p = displayPages[value]; const hash = `${p.x},${p.y},${p.width},${p.height}`; if (geometry.current.get(value) === hash) return []; geometry.current.set(value, hash); return [{ id: value, x: p.x, y: p.y, width: p.width, height: p.height }] })
    const removed = [...geometry.current.keys()].filter(value => !boardIds.includes(value)); for (const value of removed) geometry.current.delete(value)
    const controller = new AbortController()
    void compute.updatePages(upserts, removed, doc.seq).then(() => {
      if (!canvasMode) return
      return compute.visible(boardQuery.rect, doc.seq, controller.signal).then(ids=>setVisibleBoardResult({key:boardQuery.key,ids}))
    }).catch(error => { if (error?.name !== 'AbortError') setNotice('画板计算暂时不可用，请重试。') })
    return () => controller.abort()
  }, [doc, boardIds, displayPages, canvasMode, boardQuery, compute])
  const boards = useMemo(() => {
    if (!doc || !visible || !authorized) return []
    if (!canvasMode) return current ? [current] : []
    const ids = new Set(visibleBoards); if ((editingId || selected.length || draftCount || cropping || kind==='design'&&selectedPages.includes(current?.id??'')) && current) ids.add(current.id)
    for(const id of [...boardTransforms.preview.activeIds,...boardTransforms.preview.retainedIds])ids.add(id)
    return [...ids].flatMap(value => boardIds.includes(value) && displayPages[value] ? [displayPages[value]] : [])
  }, [doc, boardIds, displayPages, visible, authorized, canvasMode, current, visibleBoards, editingId, selected.length, draftCount, cropping,kind,selectedPages,boardTransforms.preview.activeIds,boardTransforms.preview.retainedIds])
  const detailedBoards = useMemo(() => canvasMode && scale < .15 ? boards.filter(p=>p.id===pageId||!!editingId&&p.nodes[editingId]) : boards,[boards,canvasMode,scale,pageId,editingId])
  const detailedSurfaces=useMemo(()=>canvasMode&&renderedCanvasContent?[...detailedBoards,renderedCanvasContent]:detailedBoards,[canvasMode,detailedBoards,renderedCanvasContent])
  const visibleElements = useVisibleElements({ pages: detailedSurfaces, revision: doc?.seq ?? 0, viewport, scale, root: viewportRef, compute, pageId, selected, editingId, onError: setNotice,naturalSource:canvasContent,naturalSizes,naturalDocument:doc??undefined,naturalRevision,onNaturalLayout })
  useLayoutEffect(()=>{if(!commentThreads.length)return;const positions:Record<string,{pageId:string;x:number;y:number}>={};for(const thread of commentThreads){const anchor=decodeCommentAnchor(thread.anchor),page=anchor?.pageId===canvasContentId?renderedCanvasContent:anchor?displayPages[anchor.pageId]??doc?.pages[anchor.pageId]:undefined;if(!anchor||!page)continue;const node=anchor.nodeId?page.nodes[anchor.nodeId]:undefined;const point=node?pointInFrame(anchor,readNodeFrame(viewportRef.current,page,node,scale)):commentPoint(anchor,page);if(point)positions[thread.id]={pageId:page.id,...point}}setCommentPositions(old=>JSON.stringify(old)===JSON.stringify(positions)?old:positions)},[commentThreads,doc,displayPages,viewport,scale,preview,canvasContentId,renderedCanvasContent,visibleElements])
  useLayoutEffect(()=>{
    if(!commentsOpen||!commentAnchor||!doc)return
    const previewing=focusedBoardId===commentAnchor.pageId,element=previewing?boardPreviewViewport.current:viewportRef.current,commentScale=previewing?boardPreviewView.scale:scale
    const page=commentAnchor.pageId===canvasContentId?renderedCanvasContent:previewing?doc.pages[commentAnchor.pageId]:displayPages[commentAnchor.pageId]??doc.pages[commentAnchor.pageId],shell=element?.querySelector<HTMLElement>(`[data-page-id="${commentAnchor.pageId}"]`),root=editorRoot.current
    if(!page||!shell||!root)return
    const node=commentAnchor.nodeId?page.nodes[commentAnchor.nodeId]:undefined,point=node?pointInFrame(commentAnchor,readNodeFrame(element,page,node,commentScale)):commentPoint(commentAnchor,page)
    if(!point)return
    const rect=shell.getBoundingClientRect(),bounds=root.getBoundingClientRect(),next={x:rect.left-bounds.left+point.x*commentScale,y:rect.top-bounds.top+point.y*commentScale}
    setCommentAttachmentPoint(old=>old&&old.x===next.x&&old.y===next.y?old:next)
  },[commentsOpen,commentAnchor,doc,displayPages,viewport,scale,preview,boards,canvasContentId,renderedCanvasContent,visibleElements,focusedBoardId,boardPreviewView])
  const beginCrop=(node:ArtifactNode,page:ArtifactPage)=>{setCroppingFrame(readNodeFrame(viewportRef.current,page,node,scale));setCropping(node)}
  const themeTokens = doc?.themeId ? doc.themes[doc.themeId]?.tokens : undefined
  useEffect(() => {
    if (!themeTokens || !doc) return
    const controller = new AbortController()
    void compute.resolveTheme(themeTokens, doc.seq, controller.signal).then(result => { if (!controller.signal.aborted) { setResolvedTheme({ source: themeTokens, tokens: result.tokens }); if (result.issues.length) setNotice('主题包含无法解析的引用，部分元素使用默认样式。') } }).catch(error => { if (error?.name !== 'AbortError') setNotice('主题计算暂时不可用。') })
    return () => controller.abort()
  }, [compute, themeTokens, doc?.seq])
  const renderDocument = useMemo(() => doc && doc.themeId && resolvedTheme && resolvedTheme.source === themeTokens ? { ...doc, themes: { ...doc.themes, [doc.themeId]: { ...doc.themes[doc.themeId], tokens: resolvedTheme.tokens } } } : doc, [doc, resolvedTheme, themeTokens])
  const selectPage = useCallback((value: string,reveal=true) => { flushText(); setPointEditing(null); setEditingId(null); setCropping(null); setSelected([]); setPageId(value); if(kind==='design'&&doc?.pages[value])setCanvasPageId(canvasPageOf(doc.pages[value])); if (reveal && canvasMode && doc?.pages[value] && viewportRef.current) { const p = displayPages[value]??doc.pages[value]; viewportRef.current.scrollTo({ left: panPadding.x+Math.max(0, (p.x - origin.x) * scale), top: panPadding.y+Math.max(0, (p.y - origin.y) * scale), behavior: 'instant' }) } }, [doc, kind, displayPages, canvasMode, origin, scale, panPadding.x,panPadding.y,flushText])
  useEffect(() => { if(canvasContentId)void session.ensurePage(canvasContentId); if (current) void session.ensurePage(current.id); if (scale >= .15) for (const value of visibleBoards) if(boardIds.includes(value)) void session.ensurePage(value) }, [current?.id,canvasContentId, visibleBoards, boardIds, session, state.loadedPageIds, scale])
  useEffect(() => { if (!contextMenu) return; const close = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)){contextReturn.current=null;setContextMenu(null)} }; window.addEventListener('pointerdown',close); return () => window.removeEventListener('pointerdown',close) },[contextMenu])
  useLayoutEffect(()=>{
    const root=editorRoot.current,menu=menuRef.current;if(!contextMenu||!root||!menu)return
    const x=Math.max(4,Math.min(contextMenu.x,root.clientWidth-menu.offsetWidth-4)),y=Math.max(4,Math.min(contextMenu.y,root.clientHeight-menu.offsetHeight-4))
    if(x!==contextMenu.x||y!==contextMenu.y)setContextMenu({x,y})
  },[contextMenu,viewport.width,viewport.height])
  const contextCallback = useRef(onEditorContext); contextCallback.current = onEditorContext
  useEffect(() => {
    if (!visible || !doc || revisionSeq!==undefined) return
    const context: SlideEditorContext = { slideId: current?.id ?? null, selectedElementIds: selected, selectedText: selectedNodes.map(node => node.text ?? node.source ?? '').join('\n').slice(0, 16000), selection: selectedNodes.map(node => ({ id: node.id, kind: node.type, label: (node.text ?? node.source ?? nodeTypeLabels[node.type]).slice(0, 2000) })), slideTitle: current?.title ?? '', slideIndex: current ? doc.pageOrder.indexOf(current.id) + 1 : 0, slideCount: doc.pageOrder.length, selectedSlides: selectedPages.length ? selectedPages : current ? [current.id] : [], mode: presenting ? 'present' : 'edit', dirty: state.pending > 0 || draftCount > 0, version: String(doc.seq) }
    if (contextCallback.current) contextCallback.current(context)
    else { const controller = new AbortController(); void http(`/artifacts/${encodeURIComponent(artifactId)}/editor-context`, { method: 'PUT', body: JSON.stringify(context), signal: controller.signal }).catch(() => { if (!controller.signal.aborted) setNotice('编辑上下文尚未同步，请稍后再发送。') }); return () => controller.abort() }
  }, [doc, current, selected, selectedPages, state.pending, draftCount, presenting, visible, artifactId,revisionSeq])
  const inspectDispatch = useCallback((operations: ArtifactOperation[]) => { try { session.dispatch(operations, inspectorBase.current ?? undefined); inspectorBase.current = session.getSnapshot().document } catch { setNotice('此属性已有新修改，未覆盖。本地修改保留在恢复副本中。') } }, [session])
  const patchNode = useCallback((patch: Partial<ArtifactNode>, unset?: string[]) => { if (!currentRef.current) return; inspectDispatch(selectedRef.current.map(nodeId => ({ type: 'node.patch', pageId: currentRef.current!.id, nodeId, patch:patch.style&&canvasContentOwner(session.getSnapshot().document!,currentRef.current!.id)?{...patch,style:canvasFontPatch(currentRef.current!.nodes[nodeId],patch.style)}:patch, ...(unset?.length ? { unset } : {}) }))) }, [inspectDispatch,session])
  const changeText = useCallback((nodeId: string, richText: ArtifactRichText, text: string) => { const page = textPage.current ? textBase.current?.pages[textPage.current] : currentRef.current; if (page && page.nodes[nodeId]) {
    const node=page.nodes[nodeId],base=textBase.current??session.getSnapshot().document
    let height:number|undefined
    if(node.type==='note'&&base&&canvasPages(base).some(sheet=>sheet.contentId===page.id)){
      const element=viewportRef.current?.querySelector<HTMLElement>(`[data-page-id="${page.id}"] [data-node-id="${nodeId}"]`),content=element?.querySelector<HTMLElement>('.tiptap')
      if(element&&content){const previous={height:content.style.height,minHeight:content.style.minHeight};content.style.height='auto';content.style.minHeight='0';const style=getComputedStyle(element);height=content.offsetHeight>0?Math.max(40,Number.parseFloat(getComputedStyle(content).height)+Number.parseFloat(style.paddingTop)+Number.parseFloat(style.paddingBottom)):undefined;content.style.height=previous.height;content.style.minHeight=previous.minHeight}
    }
    try { session.dispatch([{ type: 'node.patch', pageId: page.id, nodeId, patch: { richText, text,...(height!==undefined?{height}:{}) } }], textBase.current ?? undefined); textBase.current = session.getSnapshot().document } catch { setNotice('此文本已有其他修改，未覆盖。请复制当前文字后重新打开文本。') } } }, [session])
  const finishText = useCallback(() => { setEditingId(null);queueMicrotask(()=>editorRoot.current?.focus({preventScroll:true})) }, [])
  const changeCell = useCallback((nodeId: string, row: number, column: number, text: string) => { const p = textPage.current ? textBase.current?.pages[textPage.current] : currentRef.current; const node = p?.nodes[nodeId]; if (!p || !node?.cells) return; const cells = node.cells.map(items => [...items]); cells[row][column] = text; dispatch([{ type: 'node.patch', pageId: p.id, nodeId, patch: { cells } }], textBase.current ?? undefined); textBase.current = session.getSnapshot().document }, [dispatch, session])
  const flowSize = useCallback((id: string, height: number) => {
    const snapshot = session.getSnapshot()
    if (!snapshot.document || !snapshot.write || snapshot.conflict) return
    const document = snapshot.document, page = document.pages[id]
    if (!page || page.sizing !== 'flow' || Math.abs(page.height - height) <= 1) return
    const manifest = { artboards: document.pageOrder.map(value => { const p = document.pages[value]; return { file: p.id, page:canvasPageOf(p), x: p.x, y: p.y, w: p.width, h: p.height } }) }
    const next = resizeFlowManifest(manifest, id, { w: page.width, h: height }, item => item)
    if (next === manifest) return
    dispatch(next.artboards.flatMap(board => { const p = document.pages[board.file]; return p.height !== board.h || p.y !== board.y ? [{ type: 'page.patch' as const, pageId: p.id, patch: { height: board.h, y: board.y } }] : [] }))
  }, [session, dispatch])
  const rememberCanvasView=(value:string,view:CanvasView)=>{canvasViews.current.delete(value);canvasViews.current.set(value,view);while(canvasViews.current.size>MAX_CANVAS_PAGES){const oldest=canvasViews.current.keys().next().value;if(oldest!==undefined)canvasViews.current.delete(oldest)}}
  const checkedPageLink=useRef(false)
  useEffect(()=>{if(checkedPageLink.current||!authorized||!doc||kind!=='design')return;checkedPageLink.current=true;const link=readDesignLink(new URLSearchParams(window.location.search));if(link?.artifactId===artifactId&&link.canvasPageId&&!canvasPages(doc).some(sheet=>sheet.id===link.canvasPageId))setNotice('链接中的页面已删除或不存在，已打开第一个页面。')},[authorized,doc,kind,artifactId])
  const chooseCanvasPage=(value:string)=>{
    const element=viewportRef.current
    // An unloaded projection is not a user camera. A quick return must still
    // fit the real contents when their first page request completes.
    if(initialCamera.current&&pendingCanvasFit.current!==activeCanvasId)rememberCanvasView(activeCanvasId,{zoom,...previousCanvasMapping.current?.world})
    const sheet=doc&&canvasPages(doc).find(sheet=>sheet.id===value),content=sheet?.contentId?doc?.pages[sheet.contentId]:undefined
    const remembered=canvasViews.current.get(value),awaitingBody=!remembered&&!!sheet?.contentId&&!state.loadedPageIds.includes(sheet.contentId)
    const fit=!remembered&&!awaitingBody?fitDesignCamera(doc?.pageOrder.filter(id=>canvasPageOf(doc.pages[id])===value).map(id=>doc.pages[id])??[],content?elementBounds(content,false):[],viewport.width,viewport.height):undefined
    const next:CanvasView=remembered??(fit?{zoom:fit.scale*2,x:fit.x,y:fit.y}:{zoom:1})
    pendingCanvasFit.current=awaitingBody?value:null
    if(!awaitingBody)rememberCanvasView(value,next)
    pendingCanvasView.current=next;flushText();setSelectedPages([]);pageSelectionAnchor.current=null;setPointEditing(null);setEditingId(null);setCropping(null);setSelected([]);setCanvasPageId(value);setPageId(doc?.pageOrder.find(id=>canvasPageOf(doc.pages[id])===value)??null);setZoom(next.zoom)
    if(value===activeCanvasId){const mapping=previousCanvasMapping.current,point=mapping&&next.x!==undefined&&next.y!==undefined?cameraScroll({x:next.x,y:next.y},mapping):{x:panPadding.x,y:panPadding.y};element?.scrollTo({left:point.x,top:point.y});pendingCanvasView.current=null}
  }
  const copyCanvasLink=async(value:string)=>{try{const link=designPageLink(new URL(window.location.href),artifactId,value);await navigator.clipboard.writeText(link);setNotice('页面链接已复制。')}catch(error){setNotice(editorError(error,'页面链接尚未复制，请检查剪贴板权限后重试。'))}}
  const addCanvasPage=()=>{const base=session.getSnapshot().document;if(!base)return;try{const value=id(),board={...createPage(id(),'画板 1'),width:800,height:600,canvasPageId:value};delete board.themeBackground;rememberCanvasView(value,{zoom:initialCanvasZoom([board],viewport.width,viewport.height)});session.dispatch([...createCanvasPage(base,value),{type:'page.insert',page:board}],base);chooseCanvasPage(value);setPageId(board.id)}catch(error){setNotice(editorError(error,'页面尚未创建，请重试。'))}}
  const closeCanvasDialog=()=>{setDialog(null);requestAnimationFrame(()=>editorRoot.current?.querySelector<HTMLElement>('[aria-label="页面菜单"]')?.focus({preventScroll:true}))}
  const openCanvasDialog=(value:string,action:'canvas-rename'|'canvas-delete')=>{canvasDialogBase.current=session.getSnapshot().document;setCanvasDialogId(value);setDialogText(canvasSheets.find(sheet=>sheet.id===value)?.name??'');setCanvasDialogError('');setDialog(action)}
  const renameCanvasPageAction=()=>{const base=canvasDialogBase.current,live=session.getSnapshot();if(!base||!canvasDialogId||!dialogText.trim()||!canvasWritable||!live.write||live.conflict)return;if(canvasPages(base).find(sheet=>sheet.id===canvasDialogId)?.name===dialogText.trim()){closeCanvasDialog();return}try{session.dispatch(renameCanvasPage(base,canvasDialogId,dialogText),base);closeCanvasDialog()}catch(error){setCanvasDialogError(session.getSnapshot().conflict?'页面名称已有新修改。你的输入已保留，请取消后处理保存冲突。':editorError(error,'页面尚未重命名，请重试。'))}}
  const removeCanvasPage=async()=>{if(!canvasDialogId)return;setCanvasDeleting(true);setCanvasDialogError('');try{flushText();await session.flush();const before=session.getSnapshot().document;if(!before)return;await Promise.all(artifactPageIds(before).filter(id=>canvasPageOf(before.pages[id])===canvasDialogId).map(id=>session.ensurePage(id)));const state=session.getSnapshot(),base=state.document;if(!base)return;if(artifactPageIds(base).some(id=>canvasPageOf(base.pages[id])===canvasDialogId&&!state.loadedPageIds.includes(id)))throw new Error('页面已有新画板，请重新打开后重试。');session.dispatch(deleteCanvasPage(base,canvasDialogId),base);if(canvasDialogId===activeCanvasId){const next=canvasPages(base).find(sheet=>sheet.id!==canvasDialogId);if(next)chooseCanvasPage(next.id)}closeCanvasDialog();setEditingId(null);setCropping(null);setSelected([])}catch(error){setCanvasDialogError(editorError(error,'页面尚未删除，请重试。'))}finally{setCanvasDeleting(false)}}
  const addPage = () => { if (!doc) return; const page = createPage(id(), `${kind === 'slides' ? '页面' : '画板'} ${doc.pageOrder.length + 1}`); if (kind === 'design') { if(doc.canvasPages)page.canvasPageId=activeCanvasId;page.x = (boardIds.length % 4) * (page.width + 80); page.y = Math.floor(boardIds.length / 4) * (page.height + 100) } dispatch([{ type: 'page.insert', page }]); setPageId(page.id); setSelected([]) }
  const addNode = (type: ArtifactNodeType, extra: Partial<ArtifactNode> = {}) => { if (!current) return; const node = { ...(type==='table'?createTableNode(id(),current):createNode(type, id())), ...extra }; dispatch([{ type: 'node.insert', pageId: current.id, node }]); setSelected([node.id]); textBase.current = session.getSnapshot().document; textPage.current = current.id; setEditingId(type === 'text' ? node.id : null) }
  async function uploadImage(file: File) {
    if (!current || !writable) return
    if (!/^(image\/(png|jpeg|webp|gif|avif|svg\+xml)|video\/(mp4|webm|ogg))$/.test(file.type)) { setNotice('请选择图片或受支持的视频。'); return }
    if (file.size > 20 * 1024 * 1024) { setNotice('文件大小不能超过 20 兆字节。'); return }
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
    const copies = duplicateNodes(nodes,id)
    dispatch(copies.map(node => ({ type: 'node.insert', pageId: current.id, node }))); setSelected(copies.map(node => node.id))
  }
  const groupSelection = () => {
    if (!current || selectedNodes.length < 2 || selectedNodes.some(node => node.parentId)) return
    const x = Math.min(...selectedNodes.map(node => node.x)), y = Math.min(...selectedNodes.map(node => node.y))
    const group = { ...createNode('group', id()), scope: selectedNodes.every(n => n.scope === 'canvas') ? 'canvas' as const : 'artboard' as const, x, y, width: Math.max(...selectedNodes.map(node => node.x + node.width)) - x, height: Math.max(...selectedNodes.map(node => node.y + node.height)) - y, layout: { mode: 'absolute' as const } }
    dispatch([{ type: 'node.insert', pageId: current.id, node: group }, ...selectedNodes.map(node => ({ type: 'node.patch' as const, pageId: current.id, nodeId: node.id, patch: { parentId: group.id, x: node.x - x, y: node.y - y } }))]); setSelected([group.id])
  }
  const ungroup = () => { if (!current || primary?.type !== 'group') return; const children=ungroupNodes(primary,current.nodeOrder.map(value=>current.nodes[value]).filter(node=>node.parentId===primary.id));dispatch([...children.map(node=>({type:'node.patch' as const,pageId:current.id,nodeId:node.id,patch:{parentId:node.parentId,x:node.x,y:node.y,rotation:node.rotation,flipX:node.flipX,flipY:node.flipY,...(node.scope?{scope:node.scope}:{})}})),{type:'node.delete',pageId:current.id,nodeId:primary.id}]);setSelected(children.map(n=>n.id)) }
  const align = (direction: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    if (!current || !selectedNodes.length) return
    const bounds = selectedNodes.length === 1 ? { x: 0, y: 0, width: current.width, height: current.height } : { x: Math.min(...selectedNodes.map(node => node.x)), y: Math.min(...selectedNodes.map(node => node.y)), width: 0, height: 0 }
    if (selectedNodes.length > 1) { bounds.width = Math.max(...selectedNodes.map(node => node.x + node.width)) - bounds.x; bounds.height = Math.max(...selectedNodes.map(node => node.y + node.height)) - bounds.y }
    dispatch(selectedNodes.map(node => ({ type: 'node.patch', pageId: current.id, nodeId: node.id, patch: direction === 'left' ? { x: bounds.x } : direction === 'center' ? { x: bounds.x + (bounds.width - node.width) / 2 } : direction === 'right' ? { x: bounds.x + bounds.width - node.width } : direction === 'top' ? { y: bounds.y } : direction === 'middle' ? { y: bounds.y + (bounds.height - node.height) / 2 } : { y: bounds.y + bounds.height - node.height } })))
  }
  const recovery=()=>({...session.recovery(),commentDrafts:commentDrafts.recovery(),vectorDrafts:vectorDrafts.recovery(),vectorEditDrafts:vectorEditDrafts.recovery(),speakerNoteDrafts:speakerNoteDrafts.recovery()})
  const retainedRecovery=retainedDrafts||state.pending>0||draftCount>0||vectorDrafts.size>0||vectorEditDrafts.size>0||speakerNoteDrafts.size>0
  const downloadRecovery=()=>download(new Blob([JSON.stringify(recovery())],{type:'application/json'}),`${title}.lingxi-recovery.json`)
  const recoverAndReload=()=>{downloadRecovery();vectorTool.current?.discard();pointEditor.current?.discard();vectorDrafts.clear();vectorEditDrafts.clear();speakerNoteDrafts.clear();setSpeakerNoteError('');setPointEditing(null);setTool('select');void session.discardAfterRecovery()}
  async function downloadSource() { try { const source = await http<unknown>(`/artifacts/${encodeURIComponent(artifactId)}/source`); download(new Blob([JSON.stringify(source)], { type: 'application/json' }), `${title}.lingxi-source.json`) } catch { setNotice('原始文件暂时无法下载，请重试。') } }
  async function doExport(format: ArtifactExportFormat, choice?:BoardExportChoice) {
    flushText(); setEditingId(null); setNotice(''); const controller = new AbortController(); exportingAbort.current = controller; setExporting('正在准备导出')
    try { if(speakerNoteDrafts.size>0||state.pending>0&&!state.write)throw new Error('导出前需保存本地修改，也可先下载副本并重新载入。');await session.flush(); const snapshot = await session.exportSnapshot(controller.signal); let document = snapshot.document; if (!document) return; const exportIds=choice?.pageIds??(['png','jpeg','svg'].includes(format)&&current&&boardIds.includes(current.id)?[current.id]:undefined);if(exportIds){const pageIds=exportIds.filter(id=>document!.pageOrder.includes(id));if(!pageIds.length)throw new Error('没有可导出的画板。');document={...document,...(choice?.title?{title:choice.title}:{}),pageOrder:pageIds,pages:Object.fromEntries(pageIds.map(id=>[id,document!.pages[id]])),...(document.canvasPages?{canvasPages:document.canvasPages.map(({contentId:_content,...sheet})=>sheet)}:{})}}; { const { exportPages } = await import('./export-pages'); document = exportPages(document,format);const { captureEmbedPreviews } = await import('./capture-embeds'); document = await captureEmbedPreviews(document, controller.signal, snapshot.pageVersions) } const { exportArtifact } = await import('./export-artifact'); const result = await exportArtifact(document, { format,pixelRatio:choice?.pixelRatio,htmlArchive:choice?.htmlArchive, resolveAsset: (asset, signal) => fetchArtifactAsset(asset, artifactId, signal), signal: controller.signal, onProgress: (done, total) => setExporting(`正在导出 ${done}/${total}`) }); if (!controller.signal.aborted) { download(result.blob, result.filename); setNotice(result.warnings.join('；')) } }
    catch (error) { if (!controller.signal.aborted) setNotice(editorError(error, '导出失败，请重试。')) }
    finally { exportingAbort.current = null; setExporting('') }
  }
  function canvasBodyForInsert() {
    const base=session.getSnapshot().document
    if(!base)return
    const sheet=canvasPages(base).find(sheet=>sheet.id===activeCanvasId)
    if(!sheet)return
    if(sheet.contentId){if(!session.getSnapshot().loadedPageIds.includes(sheet.contentId)){setNotice('正在加载画布内容…');return}return base.pages[sheet.contentId]}
    if(!canvasWritable)return
    const value=id()
    try{session.dispatch(createCanvasContents(base,activeCanvasId,value),base);return session.getSnapshot().document?.pages[value]}catch(error){setNotice(editorError(error,'画布内容尚未创建，请重试。'))}
  }
  function canvasWorldPoint(event:{clientX:number;clientY:number}){const rect=viewportRef.current!.querySelector('.native-board-space')!.getBoundingClientRect();return{x:(event.clientX-rect.left-canvasInset.x)/scale+origin.x-64,y:(event.clientY-rect.top-canvasInset.y)/scale+origin.y-64}}
  function commitCanvasVector(geometry:PenGeometry,start:VectorStart){
    if(!canvasWritable||!session.getSnapshot().write||session.getSnapshot().conflict)return false
    const base=start.document,sheet=canvasPages(base).find(sheet=>sheet.id===start.canvasPageId)
    if(!sheet)return false
    const bodyId=sheet.contentId??id(),node=canvasPenNode(id(),geometry)!,operations:ArtifactOperation[]=[...(!sheet.contentId?createCanvasContents(base,sheet.id,bodyId):[]),{type:'node.insert',pageId:bodyId,node:{...node,scope:'canvas'}}]
    try{session.dispatch(operations,base);setPageId(bodyId);setSelected([node.id]);return true}catch(error){setNotice(editorError(error,'路径尚未保存，请处理冲突后重试。'));return false}
  }
  function beginPointEditing(node:ArtifactNode,page:ArtifactPage){
    if(!writable||!node.path)return
    flushText();setEditingId(null);setCropping(null);setTool('select');setPageId(page.id);setSelected([node.id]);setPointEditing({pageId:page.id,nodeId:node.id});editorRoot.current?.focus({preventScroll:true});if(!CanvasPointTool)setNotice('正在加载控制点工具…')
  }
  function pointCapture():VectorEditBase|undefined{
    const snapshot=session.getSnapshot(),page=pointEditing&&snapshot.document?.pages[pointEditing.pageId],node=page&&pointEditing&&page.nodes[pointEditing.nodeId]
    if(!snapshot.document||!page||!node)return
    const frame=readNodeFrame(viewportRef.current,page,node,scale)
    return{document:snapshot.document,frame:{...frame,width:node.width,height:node.height}}
  }
  function pointView():PointView {
    const page=pointEditing&&doc?.pages[pointEditing.pageId],shell=page&&viewportRef.current?.querySelector<HTMLElement>(`[data-page-id="${page.id}"]`),space=viewportRef.current?.querySelector<HTMLElement>('.native-board-space'),surface=shell?.getBoundingClientRect(),board=space?.getBoundingClientRect()
    return{scale,offsetX:(surface?.left??0)-(board?.left??0),offsetY:(surface?.top??0)-(board?.top??0),toWorld:event=>{const rect=shell?.getBoundingClientRect();return{x:(event.clientX-(rect?.left??0))/scale,y:(event.clientY-(rect?.top??0))/scale}}}
  }
  function commitPointEdit(patch:VectorNodePatch,base:VectorEditBase,readKeys:readonly string[]){
    const snapshot=session.getSnapshot(),target=pointEditing
    if(!target||!snapshot.write||!snapshot.document||snapshot.conflict)return false
    const current=snapshot.document.pages[target.pageId]?.nodes[target.nodeId]
    if(!current){setNotice('路径已被移除，未保存的修改已保留，可下载本地副本。');return false}
    if(['x','y','width','height'].every(key=>current[key as 'x'|'y'|'width'|'height']===patch[key as 'x'|'y'|'width'|'height'])&&JSON.stringify(current.path)===JSON.stringify(patch.path))return true
    try{session.dispatch([{type:'node.patch',pageId:target.pageId,nodeId:target.nodeId,patch}],base.document,readKeys);return true}catch(error){setNotice(editorError(error,'路径尚未保存，请处理冲突后重试。'));return false}
  }
  function vectorPointerDown(event:ReactPointerEvent){if(vectorTool.current)vectorTool.current.down(event);else{event.preventDefault();event.stopPropagation();setNotice(vectorLoadFailed?'钢笔工具未能加载，请刷新页面后重试。':'正在加载钢笔工具…')}}
  function pointerDown(event: ReactPointerEvent, page: ArtifactPage, canvas = false) {
    if (presenting || event.button > 1) return
    if(!event.isPrimary&&pointEditor.current?.isDragging()){event.preventDefault();event.stopPropagation();return}
    pendingComment.current=null
    if ((event.target as HTMLElement).closest('button,input,textarea')) return
    if(event.button===1||space.current||tool==='hand'){if(previousCanvasMapping.current)previousCanvasMapping.current.awaitingLayout=false;event.preventDefault();gesture.current={base:session.getSnapshot().document!,type:'pan',startX:event.clientX,startY:event.clientY,pageId:page.id,nodes:[],moved:false,scrollX:viewportRef.current?.scrollLeft,scrollY:viewportRef.current?.scrollTop};event.currentTarget.setPointerCapture(event.pointerId);return}
    if(pointEditing){flushText();setPointEditing(null)}
    if(kind==='design'&&tool==='pen'&&event.button===0&&!space.current){vectorPointerDown(event);return}
    if(kind==='design'&&tool==='pencil'&&!penFitter.current){event.preventDefault();setNotice(penLoadFailed?'绘图工具未能加载，请刷新页面后重试。':'正在加载绘图工具…');return}
    if(!canvas&&kind==='design'&&page.id!==canvasContentId&&['text','note','pencil','pen','arrow','line','shape'].includes(tool)){const body=canvasBodyForInsert();if(body)pointerDown(event,body,true);return}
    if (!(event.target as HTMLElement).closest('[contenteditable="true"]')) editorRoot.current?.focus({preventScroll:true})
    if (tool === 'comment') { const target=(event.target as HTMLElement).closest<HTMLElement>('[data-node-id]'), shell=viewportRef.current?.querySelector<HTMLElement>(`[data-page-id="${page.id}"]`);const rect=canvas?event.currentTarget.getBoundingClientRect():shell?.getBoundingClientRect();if(rect){setPageId(page.id);const point=canvas?canvasWorldPoint(event):{x:(event.clientX-rect.left)/scale,y:(event.clientY-rect.top)/scale},node=target?.dataset.nodeId?page.nodes[target.dataset.nodeId]:undefined;pendingComment.current=node?anchorInFrame(page.id,node.id,readNodeFrame(viewportRef.current,page,node,scale),point):commentAnchorAtPoint(page,undefined,point)}event.preventDefault();return }
    if (event.button === 1 || space.current || tool === 'hand') { if(previousCanvasMapping.current)previousCanvasMapping.current.awaitingLayout=false; event.preventDefault(); gesture.current = { base: session.getSnapshot().document!, type: 'pan', startX: event.clientX, startY: event.clientY, pageId: page.id, nodes: [], moved: false, scrollX: viewportRef.current?.scrollLeft, scrollY: viewportRef.current?.scrollTop }; event.currentTarget.setPointerCapture(event.pointerId); return }
    if (writable && ['text', 'note', 'pencil', 'pen', 'arrow', 'line', 'shape', 'frame'].includes(tool)) {
      const rect = event.currentTarget.getBoundingClientRect(), point = canvas?canvasWorldPoint(event):{ x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale }
      setPageId(page.id)
      if (['pencil', 'pen', 'arrow', 'line','shape'].includes(tool)) {
        if(canvas&&['pencil','pen'].includes(tool)&&!penFitter.current){event.preventDefault();setNotice(penLoadFailed?'绘图工具未能加载，请刷新页面后重试。':'正在加载绘图工具…');return}
        gesture.current = { base: session.getSnapshot().document!, type: 'draw', pageId: page.id, startX: event.clientX, startY: event.clientY, nodes: [], moved: false, points: [point], tool, scope: canvas ? 'canvas' : 'artboard' }; setDrawingPreview([point]); event.currentTarget.setPointerCapture(event.pointerId)
      } else if (tool === 'frame') addPage()
      else { const type = tool === 'note' ? 'note' : tool === 'shape' ? 'shape' : 'text'; const node = { ...(canvas&&(type==='text'||type==='note')?createCanvasText(id(),type):createNode(type, id())), x: point.x, y: point.y, ...(canvas ? {scope: 'canvas' as const} : {}), ...(type === 'shape' ? { shape: shapeTool } : {}) }; dispatch([{ type: 'node.insert', pageId: page.id, node }]); setSelected([node.id]); textBase.current = session.getSnapshot().document; textPage.current = page.id; setEditingId(type === 'text' || type === 'note' ? node.id : null); setTool('select') }
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
    const nodes = next.flatMap(value => page.nodes[value] && !page.nodes[value].locked ? [paintedCodeNode(page,page.nodes[value],viewportRef.current,scale)] : [])
    const positionPins=capturePositionPins(page,nodes,canvas)
    gesture.current = { base: session.getSnapshot().document!, type: node ? 'move' : 'marquee', startX: event.clientX, startY: event.clientY, pageId: page.id, nodes, moved: false, canvas,positionPins }
    event.preventDefault()
  }
  function capturePositionPins(page:ArtifactPage,nodes:ArtifactNode[],canvas=false){
    const frames:Record<string,ElementPositionPins>={}
    if(kind==='design'&&!canvas)for(const node of nodes){if(!page.nodes[node.id].css)continue;const element=viewportRef.current?.querySelector<HTMLElement>(`[data-page-id="${page.id}"] [data-node-id="${node.id}"]`),pins=element&&readElementPositionPins(element);if(pins)frames[node.id]=pins}
    return frames
  }
  function canvasPointerDown(event:ReactPointerEvent) {
    if(!canvasMode||event.target!==event.currentTarget)return
    if(!event.isPrimary&&pointEditor.current?.isDragging()){event.preventDefault();event.stopPropagation();return}
    if((event.button===1||space.current||tool==='hand')&&doc){if(previousCanvasMapping.current)previousCanvasMapping.current.awaitingLayout=false;event.preventDefault();gesture.current={base:doc,type:'pan',startX:event.clientX,startY:event.clientY,pageId:current?.id??'',nodes:[],moved:false,scrollX:viewportRef.current?.scrollLeft,scrollY:viewportRef.current?.scrollTop};event.currentTarget.setPointerCapture(event.pointerId);return}
    if(pointEditing){flushText();setPointEditing(null)}
    if(kind==='design'&&tool==='pen'&&event.button===0&&!space.current){vectorPointerDown(event);return}
    if(kind==='design'&&tool==='pencil'&&!penFitter.current){event.preventDefault();setNotice(penLoadFailed?'绘图工具未能加载，请刷新页面后重试。':'正在加载绘图工具…');return}
    let page=current
    if(kind==='design'){
      const base=session.getSnapshot().document
      if(!base)return
      const sheet=canvasPages(base).find(sheet=>sheet.id===activeCanvasId)
      if(!sheet)return
      if(sheet.contentId){
        if(!session.getSnapshot().loadedPageIds.includes(sheet.contentId)){setNotice('正在加载画布内容…');return}
        page=base.pages[sheet.contentId]
      }else if(canvasWritable&&['text','note','pencil','pen','arrow','line','shape','comment'].includes(tool)){
        page=canvasBodyForInsert()
      }
    }
    if(page)pointerDown(event,page,true)
  }
  function pointerMove(event: ReactPointerEvent) {
    if(kind==='design'&&tool==='pen'&&gesture.current?.type!=='pan'){vectorTool.current?.move(event);return}
    event.stopPropagation()
    const active = gesture.current; if (!active) return
    const dx = (event.clientX - active.startX) / scale, dy = (event.clientY - active.startY) / scale
    if (Math.hypot(dx, dy) > 3) { active.moved = true; if (!event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId) }
    if (active.type === 'draw') { const start = active.points![0]; const p = { x: start.x + dx, y: start.y + dy }; active.points = ['arrow','line','shape'].includes(active.tool!) ? [start, p] : active.scope==='canvas'?appendCanvasPenPoint(active.points!,p,scale):appendDrawingPoint(active.points!,p); setDrawingPreview(active.points); return }
    if (active.type === 'rotate') { const node = active.nodes[0]; const element = viewportRef.current?.querySelector<HTMLElement>(`[data-page-id="${active.pageId}"] [data-node-id="${node.id}"]`); if (element) { const r = element.getBoundingClientRect(); active.angle = node.rotation + (Math.atan2(event.clientY - (r.top+r.height/2), event.clientX - (r.left+r.width/2)) - Math.atan2(active.startY - (r.top+r.height/2), active.startX - (r.left+r.width/2))) * 180 / Math.PI; element.style.rotate = `${active.angle - node.rotation}deg` } return }
    if (active.type === 'pan') { viewportRef.current?.scrollTo((active.scrollX ?? 0) - (event.clientX - active.startX), (active.scrollY ?? 0) - (event.clientY - active.startY)); return }
    if (active.type === 'marquee') { const rect = (event.currentTarget as HTMLElement).getBoundingClientRect(); setMarquee({ x: (Math.min(active.startX, event.clientX) - rect.left) / scale-(active.canvas?64-origin.x+canvasInset.x/scale:0), y: (Math.min(active.startY, event.clientY) - rect.top) / scale-(active.canvas?64-origin.y+canvasInset.y/scale:0), width: Math.abs(dx), height: Math.abs(dy) }); return }
    const resized=active.type==='resize'?resizeSelection(active.nodes,active.handle??'se',dx,dy):[]
    for(const node of active.nodes){
      const element=viewportRef.current?.querySelector<HTMLElement>(`[data-page-id="${active.pageId}"] [data-node-id="${node.id}"]`);if(!element)continue
      const pins=active.positionPins?.[node.id]
      if(active.type==='move'){
        if(pins)for(const [name,value]of Object.entries(elementMoveValues(pins,dx,dy)))element.style.setProperty(name,`${value}px`,element.style.getPropertyPriority(name))
        else element.style.translate=`${dx}px ${dy}px`
      }else if(pins){
        const patch=elementResizePatch(active.base.pages[active.pageId].nodes[node.id],pins,node,resized.find(item=>item.id===node.id)!,active.handle??'se')
        for(const field of ['width','height','x','y'] as const)if(patch[field]!==undefined)element.style.setProperty(field==='x'?'left':field==='y'?'top':field,`${patch[field]}px`,element.style.getPropertyPriority(field==='x'?'left':field==='y'?'top':field))
        if(patch.css)applyCodeStyle(element,Object.fromEntries(Object.entries(patch.css).filter(([name])=>['left','right','top','bottom','width','height'].includes(name))))
      }else{element.style.width=`${Math.max(16,node.width+dx)}px`;element.style.height=node.type==='note'&&canvasPages(active.base).some(sheet=>sheet.contentId===active.pageId)?'auto':`${Math.max(16,node.height+dy)}px`}
    }
    const frames:Record<string,Pick<ArtifactNode,'x'|'y'|'width'|'height'>>={}
    for(const node of active.nodes)if(active.positionPins?.[node.id]){const frame=paintedCodeNode(active.base.pages[active.pageId],active.base.pages[active.pageId].nodes[node.id],viewportRef.current,scale);frames[node.id]={x:frame.x,y:frame.y,width:frame.width,height:frame.height}}
    setPreview({dx,dy,resize:active.type==='resize',frames})
  }
  function pointerUp(event: ReactPointerEvent|null, cancel = false) {
    if(kind==='design'&&tool==='pen'&&event&&gesture.current?.type!=='pan'){vectorTool.current?.up(event,cancel);return}
    event?.stopPropagation()
    if(pendingComment.current){const anchor=pendingComment.current;pendingComment.current=null;if(!cancel)setTimeout(()=>openComment(anchor),0);return}
    const active = gesture.current; if (!active) return
    gesture.current = null
    const dx = ((event?.clientX??active.startX) - active.startX) / scale, dy = ((event?.clientY??active.startY) - active.startY) / scale
    const latestPage=session.getSnapshot().document?.pages[active.pageId]??active.base.pages[active.pageId]
    for(const node of active.nodes)if(active.positionPins?.[node.id]){
      const latest=latestPage?.nodes[node.id],element=viewportRef.current?.querySelector<HTMLElement>(`[data-page-id="${active.pageId}"] [data-node-id="${node.id}"]`)
      if(!latestPage||!latest||!element)continue
      const parent=latest.parentId?latestPage.nodes[latest.parentId]:undefined,flow=parent?.layout?.mode==='flex'||parent?.layout?.mode==='grid'
      element.style.left=flow?'':`${latest.x}px`;element.style.top=flow?'':`${latest.y}px`;element.style.right='';element.style.bottom=''
      if(latest.css)applyCodeStyle(element,Object.fromEntries(Object.entries(latest.css).filter(([name])=>['left','right','top','bottom'].includes(name))))
    }
    for (const node of active.nodes) { const element = viewportRef.current?.querySelector<HTMLElement>(`[data-page-id="${active.pageId}"] [data-node-id="${node.id}"]`); if (element) { const authored=active.base.pages[active.pageId]?.nodes[node.id]??node; element.style.translate = ''; element.style.width = authored.textSizing==='content'?'max-content':`${authored.width}px`; element.style.height = isNaturalText(authored)&&canvasPages(active.base).some(sheet=>sheet.contentId===active.pageId)||authored.type==='group'&&active.base.pages[active.pageId]?.sizing==='flow'&&authored.layout?.mode!=='absolute'?'auto':`${authored.height}px`;if(authored.css)applyCodeStyle(element,Object.fromEntries(Object.entries(authored.css).filter(([name])=>['width','height','translate'].includes(name)))) } }
    if (active.type === 'draw') {
      if(!cancel&&active.points&&(active.points.length>1||active.tool==='shape')){const node=active.tool==='shape'?canvasShapeNode(id(),shapeTool==='ellipse'?'ellipse':'rect',active.points[0],active.moved?active.points.at(-1):undefined):active.scope==='canvas'&&['pencil','pen'].includes(active.tool??'')?canvasPenNode(id(),penFitter.current!.fitCanvasPen(active.points,1.25/scale)):drawingNode(id(),active.points,active.tool as 'pencil'|'pen'|'arrow'|'line');if(node){dispatch([{type:'node.insert',pageId:active.pageId,node:{...node,scope:active.scope}}],active.base);setSelected([node.id])}if(active.tool==='shape')setTool('select')}
      setDrawingPreview(null);return
    }
    if (active.type === 'rotate') { const node = active.nodes[0]; const element = viewportRef.current?.querySelector<HTMLElement>(`[data-page-id="${active.pageId}"] [data-node-id="${node.id}"]`); if (element) element.style.rotate = ''; if (!cancel && active.angle !== undefined) dispatch([{ type: 'node.patch', pageId: active.pageId, nodeId: node.id, patch: { rotation: Math.round(active.angle) } }], active.base); return }
    if (!cancel && active.moved && active.type === 'marquee' && marquee && doc) { const page = doc.pages[active.pageId]; setSelected(page.nodeOrder.filter(value => { const n = page.nodes[value]; return !n.parentId && n.x >= marquee.x && n.y >= marquee.y && n.x + n.width <= marquee.x + marquee.width && n.y + n.height <= marquee.y + marquee.height })) }
    else if (!cancel && active.moved && (active.type === 'move' || active.type === 'resize')) {
      const operations:ArtifactOperation[]=active.nodes.flatMap(node=>{
        const original=active.base.pages[active.pageId].nodes[node.id],pins=active.positionPins?.[node.id]
        const resized=active.type==='resize'?resizeSelection(active.nodes,active.handle??'se',dx,dy).find(item=>item.id===node.id)!:null
        const patch=active.type==='move'?pins?elementMovePatch(original,pins,dx,dy):{x:node.path?Math.round((node.x+dx)*10)/10:Math.round(node.x+dx),y:node.path?Math.round((node.y+dy)*10)/10:Math.round(node.y+dy)}:pins?elementResizePatch(original,pins,node,resized!,active.handle??'se'):((({x,y,width,height,points})=>({x,y,width,height,...(points?{points}:{})}))(resized!))
        return Object.keys(patch).length?[{type:'node.patch',pageId:active.pageId,nodeId:node.id,patch}]:[]
      })
      if(operations.length)dispatch(operations,active.base)
    }
    setPreview(null); setMarquee(null)
  }
  const penResult=usePenPreview(gesture.current?.scope==='canvas'&&gesture.current.tool==='pencil'?drawingPreview:null,scale,doc?.seq??0,compute,setNotice)
  const penPreview=penResult?.points===drawingPreview&&penResult.scale===scale?penResult.geometry:null
  const pageSelection = selectedPages.length ? selectedPages : current ? [current.id] : []
  const choosePage = (value: string, multiple = false, range = false,reveal=true) => {
    if (range && pageId && doc) { const anchor=pageSelectionAnchor.current&&doc.pages[pageSelectionAnchor.current]?pageSelectionAnchor.current:pageId;pageSelectionAnchor.current=anchor;const a = doc.pageOrder.indexOf(anchor), b = doc.pageOrder.indexOf(value); setSelectedPages(doc.pageOrder.slice(Math.min(a, b), Math.max(a, b) + 1)) }
    else {pageSelectionAnchor.current=value;setSelectedPages(previous => multiple ? previous.includes(value) ? previous.filter(id => id !== value) : [...previous, value] : [value])}
    selectPage(value,reveal)
  }
  const pageAction = async (action: 'duplicate' | 'delete' | 'skip' | 'section' | 'up' | 'down', target?: string) => {
    if (!doc || !writable) return
    const ids = target && !pageSelection.includes(target) ? [target] : pageSelection
    flushText()
    if (action === 'duplicate') { for (const value of ids) await session.ensurePage(value); const snapshot = session.getSnapshot().document; if (snapshot) dispatch(duplicatePages(snapshot, ids, id)) }
    if (action === 'delete') { dispatch(ids.map(pageId => ({ type: 'page.delete', pageId }))); setSelectedPages([]) }
    if (action === 'skip') dispatch(ids.map(pageId => ({ type: 'page.patch', pageId, patch: { skip: !doc.pages[pageId].skip } })))
    if ((action === 'up' || action === 'down') && ids.length) { const order=[...doc.pageOrder]; const index=order.indexOf(ids[0]), next=index+(action==='up'?-1:1); if(next>=0&&next<order.length) { [order[index],order[next]]=[order[next],order[index]]; dispatch([{type:'pages.reorder',pageIds:order}]) } }
    if (action === 'section') { setSelectedPages(ids); setDialogText('新节'); setDialog('section') }
  }
  const fitViewport = () => {
    if (!doc) return
    if (!canvasMode) { setZoom(1); return }
    if(kind==='design'){
      const fit=fitDesignCamera(boardIds.map(id=>doc.pages[id]),fitAnnotationBounds,viewport.width,viewport.height)
      if(fit){pendingCanvasView.current={zoom:fit.scale*2,x:fit.x,y:fit.y};setZoom(fit.scale*2);setCameraRequest(value=>value+1)}
      return
    }
    const pages = [...boardIds.map(value => doc.pages[value]),...freeBounds]; if (!pages.length) return
    const w = Math.max(...pages.map(p => p.x + p.width)) - origin.x + 128, h = Math.max(...pages.map(p => p.y + p.height)) - origin.y + 128
    setZoom(Math.max(.04, Math.min(4, Math.min((viewport.width-64)/w, (viewport.height-100)/h) * 2)))
    viewportRef.current?.scrollTo({ left: panPadding.x, top: panPadding.y });const mapping=previousCanvasMapping.current,element=viewportRef.current;if(mapping&&element)mapping.world=worldCamera({x:element.scrollLeft,y:element.scrollTop},mapping)
  }
  const openSpeakerWindow = () => {
    const popup=window.open('about:blank','', 'popup,width=1000,height=640')
    if(!popup){setNotice('演讲者窗口未能打开，讲者备注已显示在放映窗口中。');return null}
    popup.document.documentElement.lang='zh-CN'
    popup.document.title='LingxiLoop · 演讲者视图'
    Object.assign(popup.document.body.style,{margin:'0',background:'#141413',color:'#faf9f5'})
    const loading=popup.document.createElement('p');loading.dataset.speakerLoading='';loading.setAttribute('role','status');loading.textContent='正在准备演讲者视图…';popup.document.body.append(loading)
    setSpeakerWindow(popup)
    return popup
  }
  const startPresentation = (speaker = false) => {
    if(!doc)return
    const pages=doc.pageOrder.filter(id=>!doc.pages[id].skip)
    if(!pages.length)return
    const countBefore=doc.pageOrder.slice(0,Math.max(0,doc.pageOrder.indexOf(pageId??''))).filter(id=>!doc.pages[id].skip).length
    const existingSpeaker=speakerWindow&&!speakerWindow.closed
    const opened=speaker&&!coarsePointer&&!existingSpeaker?openSpeakerWindow():null
    const dockNotes=speaker&&!existingSpeaker&&!opened
    const deferred=!!opened||navigator.userActivation?.isActive===false
    // Fullscreen needs this trusted toolbar event; the player stays lazy.
    const request=!deferred&&window.document.fullscreenEnabled&&window.document.documentElement.requestFullscreen?window.document.documentElement.requestFullscreen().then(()=>true,()=>false):null
    setPresentationFullscreen({deferred,request,since:Date.now(),warning:speaker&&!coarsePointer&&!existingSpeaker&&!opened?'演讲者窗口未能打开，讲者备注已显示在放映窗口中。':undefined})
    flushText();setPageId(pages[Math.min(countBefore,pages.length-1)]);setEditingId(null);setNotesOpen(dockNotes);setPresenting(true);setZoom(1)
  }
  const reorderLayer = (front: boolean) => { if (current && writable) dispatch([{ type: 'nodes.reorder', pageId: current.id, nodeIds: front ? [...current.nodeOrder.filter(id => !selected.includes(id)), ...current.nodeOrder.filter(id => selected.includes(id))] : [...current.nodeOrder.filter(id => selected.includes(id)), ...current.nodeOrder.filter(id => !selected.includes(id))] }]) }
  const distribute = (axis: 'horizontal' | 'vertical') => { if (current) dispatch(distributeNodes(selectedNodes, axis).map(n => ({ type: 'node.patch', pageId: current.id, nodeId: n.id, patch: { x: n.x, y: n.y } }))) }
  const speakerAccessRecovery=speakerWindow?<SpeakerAccessRecovery getWindow={()=>speakerWindow} error={state.error} loading={state.loading||visible&&!authorized&&!state.error} retained={retainedRecovery} onDownload={downloadRecovery} onReload={recoverAndReload} onRetry={()=>void session.open()}/>:null
  if (visible && (!authorized || state.loading) && !state.error) return <div role="status" className="native-loading">正在打开{title}…{speakerAccessRecovery}</div>
  if (!doc) return <div className="native-loading" role="alert">{state.error || '稿件暂时无法打开'}{notice && <p>{notice}</p>}<button type="button" onClick={()=>void session.open()}>重试</button>{retainedRecovery&&<button type="button" onClick={recoverAndReload}>保留副本并重新载入</button>}<button type="button" onClick={() => void downloadSource()}>下载原始文件</button>{retainedRecovery&&<button type="button" onClick={downloadRecovery}>下载本地副本</button>}{speakerAccessRecovery}</div>
  const boardWidth = Math.max(viewport.width, ...boardIds.map(value => (displayPages[value].x - origin.x + doc.pages[value].width + 128) * scale))
  const boardHeight = Math.max(viewport.height, ...boardIds.map(value => (displayPages[value].y - origin.y + doc.pages[value].height + 128) * scale))
  return <ArtifactAssetReadContext.Provider value={assetReads.read}><EditorColorSessionContext.Provider value={()=>{inspectorBase.current=session.getSnapshot().document}}><EditorPaletteContext.Provider value={palette}><DraftContext.Provider value={drafts}><section ref={editorRoot} data-board-preview={!!focusedBoardId} data-revision={revisionSeq} data-view={view} data-compact={compact} data-compact-rail-open={compactRailOpen} data-tool={tool} data-pen-ready={!!penFitter.current} data-vector-ready={!!CanvasVectorTool} data-inspector-open={inspectorOpen && !presenting} data-comments-open={commentsOpen && !presenting} style={{'--native-inv-scale':1/scale,'--native-sidebar-width': `${!presenting ? (inspectorOpen ? kind==='design'?inspectorWidth:336 : 0) : 0}px`} as CSSProperties} className={`native-editor native-kind-${kind} ${presenting ? 'native-presenting' : ''}`} data-native-artifact-editor={kind} data-current-page={pageId} data-canvas-page-id={kind==='design'?activeCanvasId:undefined} data-save-state={state.conflict ? 'conflict' : state.pending ? 'pending' : draftCount||retainedDrafts ? 'draft' : 'saved'} aria-label={`${title}编辑器`} hidden={!visible} tabIndex={focusedBoardId||presenting?-1:0}
    onKeyDown={event => {
      if(!editorOwnsEvent(event.currentTarget,event.target))return
      if(focusedBoardId||presenting){
        if(!event.nativeEvent.isComposing&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();event.stopPropagation();drafts.flush('save');void session.retry()}
        else if(!event.nativeEvent.isComposing&&event.key==='Escape'){event.preventDefault();event.stopPropagation();if(presenting){setPresenting(false);if(window.document.fullscreenElement)void window.document.exitFullscreen()}else closeBoardPreview()}
        else if(!(event.target as HTMLElement).closest('input,textarea,[contenteditable="true"]')&&(['Delete','Backspace'].includes(event.key)||(event.ctrlKey||event.metaKey)&&['z','y'].includes(event.key.toLowerCase()))){event.preventDefault();event.stopPropagation()}
        return
      }
      if(pointEditing&&!event.nativeEvent.isComposing&&!(event.target as HTMLElement).closest('input,textarea,[contenteditable="true"],button,summary,[role=radio],[role=radiogroup]')&&pointEditor.current?.key(event))return
      if(kind==='design'&&tool==='pen'&&!event.nativeEvent.isComposing&&!(event.target as HTMLElement).closest('input,textarea,[contenteditable="true"]')&&(!(event.target as HTMLElement).closest('button,summary,[role=radio],[role=radiogroup]')||event.key==='Escape'||(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z')&&vectorTool.current?.key(event))return
      if(kind==='design'&&(event.ctrlKey||event.metaKey)&&event.altKey&&!event.shiftKey&&event.key.toLowerCase()==='l'&&!event.nativeEvent.isComposing){event.preventDefault();void copyCanvasLink(activeCanvasId);return}
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); drafts.flush('save'); void session.retry(); return }
      const typing = (event.target as HTMLElement).closest('input,textarea,[contenteditable="true"]')
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !(event.target as HTMLElement).closest('input,textarea') && !event.nativeEvent.isComposing) { event.preventDefault(); flushText(); setEditingId(null); void session.undoRedo(event.shiftKey ? 'redo' : 'undo'); return }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y' && !(event.target as HTMLElement).closest('input,textarea') && !event.nativeEvent.isComposing) { event.preventDefault(); flushText(); setEditingId(null); void session.undoRedo('redo'); return }
      if (!event.nativeEvent.isComposing && event.key==='Escape') { if(gesture.current||pendingComment.current){event.preventDefault();event.stopPropagation();pointerUp(null,true)}setCropping(null);setTool('select');closeContextMenu(!!contextReturn.current);setEditingId(null);if(presenting){event.preventDefault();event.stopPropagation();flushText();setPresenting(false);if(window.document.fullscreenElement)void window.document.exitFullscreen()}return }
      if (typing || event.nativeEvent.isComposing || (event.target as HTMLElement).closest('button,summary,a,[role=menu],[role=dialog],[role=radio],[role=radiogroup]')) return
      if(event.key==='Enter'&&selectedNodes.length===1&&selectedNodes[0].path){event.preventDefault();beginPointEditing(selectedNodes[0],current!);return}
      if (event.key === ' ') { event.preventDefault(); space.current = true }
      if ((event.ctrlKey || event.metaKey) && event.key === '\\') { event.preventDefault(); setInspectorOpen(v => !v); return }
      if ((event.ctrlKey || event.metaKey) && event.key === '0') { event.preventDefault(); fitViewport(); return }
      if ((event.ctrlKey || event.metaKey) && ['+', '=', '-'].includes(event.key)) { event.preventDefault(); setZoom(v => Math.max(.04, Math.min(8, v * (event.key === '-' ? .8 : 1.25)))); return }
      if (canvasMode && !event.ctrlKey && !event.metaKey && ['PageDown','PageUp'].includes(event.key) && current) { const index=doc.pageOrder.indexOf(current.id)+(event.key==='PageDown'?1:-1); if(doc.pageOrder[index]) {event.preventDefault();selectPage(doc.pageOrder[index])} return }
      if (!writable) return
      if (!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.repeat&&['r','o','l','d'].includes(event.key.toLowerCase())) {
        const key=event.key.toLowerCase();event.preventDefault()
        if(kind==='design'){if(key==='l')setTool(event.shiftKey?'arrow':'line');else if(key!=='d'){setShapeTool(key==='o'?'ellipse':'rect');setTool('shape')}}
        else if(key==='l')addNode('line',{height:1,lineEnd:event.shiftKey?'arrow':'none'})
        else addNode('shape',{shape:key==='o'?'ellipse':key==='d'?'diamond':'rect',...(key==='r'&&event.shiftKey?{style:{fill:'#d6e6ff',borderRadius:16}}:{})})
        return
      }
      if (!event.ctrlKey && !event.metaKey && !event.altKey) { const next = ({ v: 'select', h: 'hand', t: 'text', n: 'note', p: event.shiftKey?'pen':'pencil', c: 'comment', a: 'frame' } as Record<string, string>)[event.key.toLowerCase()]; if (next && (kind === 'design' || !['note','frame','pen'].includes(next))) { if(next==='select'){flushText();setPointEditing(null)} setTool(next); event.preventDefault() } }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase()==='m' && kind==='slides') {event.preventDefault();setDialog('layouts');return}
      if ((event.ctrlKey || event.metaKey) && event.key === 'a') { event.preventDefault(); setSelected(current?.nodeOrder ?? []) }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); pasteNodes(selectedWithChildren()) }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'g') { event.preventDefault(); event.shiftKey ? ungroup() : groupSelection() }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelection() }
      if (event.altKey && ['ArrowUp','ArrowDown'].includes(event.key)) { event.preventDefault(); void pageAction(event.key==='ArrowUp'?'up':'down'); return }
      if (current && selected.length && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();const base=session.getSnapshot().document;if(!base||!writable)return
        const step=event.shiftKey?10:1,dx=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,dy=event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0,nodes=selectedNodes.filter(node=>!node.locked),pins=capturePositionPins(current,nodes,current.id===canvasContentId)
        const operations:ArtifactOperation[]=nodes.flatMap(node=>{const original=base.pages[current.id]?.nodes[node.id];if(!original)return[];const patch=pins[node.id]?elementNudgePatch(original,pins[node.id],dx,dy):{x:node.x+dx,y:node.y+dy};return Object.keys(patch).length?[{type:'node.patch',pageId:current.id,nodeId:node.id,patch}]:[]})
        if(operations.length)dispatch(operations,base)
      }
    }} onKeyUp={event => { if(!editorOwnsEvent(event.currentTarget,event.target))return;if (event.key === ' ') space.current = false }}
    onContextMenu={event => { if(focusedBoardId)return;if(!editorOwnsEvent(event.currentTarget,event.target))return;if (presenting || (event.target as HTMLElement).closest('input,textarea,[contenteditable="true"]')) return; event.preventDefault(); const rect=event.currentTarget.getBoundingClientRect(); const target=(event.target as HTMLElement).closest<HTMLElement>('[data-node-id]'), shell=(event.target as HTMLElement).closest<HTMLElement>('[data-page-id]'); if (target && shell) { setPageId(shell.dataset.pageId!); if (!selected.includes(target.dataset.nodeId!)) setSelected([target.dataset.nodeId!]) } setContextMenu({x:Math.max(4,Math.min(rect.width-228,event.clientX-rect.left)),y:Math.max(4,Math.min(rect.height-360,event.clientY-rect.top))}) }}
    onCopy={event => { if(focusedBoardId)return;if(!editorOwnsEvent(event.currentTarget,event.target))return;if ((event.target as HTMLElement).closest('input,textarea,[contenteditable="true"]')) return; copySelection(); if (clipboard.current.length) { event.clipboardData.setData('application/lingxi-nodes', JSON.stringify(clipboard.current)); event.clipboardData.setData('text/plain', selectedNodes.map(node => node.text ?? node.source ?? '').join('\n')); event.preventDefault() } }}
    onPaste={event => { if(focusedBoardId||presenting)return;if(!editorOwnsEvent(event.currentTarget,event.target))return;if ((event.target as HTMLElement).closest('input,textarea,[contenteditable="true"]')) return; const raw = event.clipboardData.getData('application/lingxi-nodes'); if (raw) { try { pasteNodes(JSON.parse(raw)); event.preventDefault() } catch { setNotice('无法粘贴此内容。') } } else if (event.clipboardData.files.length) { void uploadImage(event.clipboardData.files[0]); event.preventDefault() } else if (event.clipboardData.getData('text/plain')) { addNode('text', { text: event.clipboardData.getData('text/plain') }); event.preventDefault() } }}>
    {focusedBoardId&&doc.pages[focusedBoardId]&&(BoardPreview?<BoardPreview document={renderDocument??doc} page={doc.pages[focusedBoardId]} compute={compute} loaded={state.loadedPageIds.includes(focusedBoardId)} pageVersion={session.getPageVersion(focusedBoardId)} revisionSeq={revisionSeq} viewportRef={boardPreviewViewport} onView={setBoardPreviewView} onSave={saveDocument} onClose={closeBoardPreview} error={state.error} comments={commentThreads} commenting={tool==='comment'&&canvasWritable} onComment={openComment} onError={setNotice} actions={<><BoardExportMenu page={doc.pages[focusedBoardId]} allPageIds={boardIds} selectedPageIds={pageSelection.filter(id=>boardIds.includes(id))} busy={!!exporting} onExport={(format,choice)=>void doExport(format,choice)}/>{revisionSeq===undefined&&<><span ref={boardHistoryAnchor} className="native-history-trigger"><IconButton icon="history" label="版本历史" active={historyOpen} onClick={()=>setHistoryOpen(value=>!value)}/></span><span className="native-comments-tools"><IconButton icon="comments" label="评论" active={tool==='comment'} disabled={!canvasWritable||!state.loadedPageIds.includes(focusedBoardId)} onClick={()=>setTool(value=>value==='comment'?'select':'comment')}/><Menu label="评论选项" align="end"><MenuItem onClick={()=>openComment(null)}>显示全部评论</MenuItem></Menu></span></>}</>}/>:<BoardPreviewLoading title={doc.pages[focusedBoardId].title} onClose={closeBoardPreview} onSave={saveDocument}/>)}
    {!presenting && <header inert={!!focusedBoardId} className="native-toolbar" aria-label="编辑工具">
      <div className="native-toolbar-island native-insert-tools">
        {kind === 'design' && <><Menu keyboardFocusSelector="button[aria-pressed=true]" className="native-canvas-pages-menu" minimumWidth={240} badge={canvasSheets.length>1?canvasSheets.length:undefined} icon="copy" label="页面菜单" text={canvasSheets.find(sheet=>sheet.id===activeCanvasId)?.name}>
          {canvasSheets.map(sheet=><div className="native-canvas-page-menu-row" key={sheet.id}><MenuItem aria-pressed={sheet.id===activeCanvasId} selected={sheet.id===activeCanvasId} onClick={()=>chooseCanvasPage(sheet.id)}>{sheet.name}</MenuItem><Menu offset={6} keyboardFocusSelector="button:not(:disabled)" className="native-canvas-page-actions-menu" minimumWidth={128} label={`页面“${sheet.name}”操作`} icon="more" align="end"><MenuItem icon="pencil" disabled={!canvasWritable} onClick={()=>openCanvasDialog(sheet.id,'canvas-rename')}>重命名页面</MenuItem><MenuItem aria-label="复制页面链接" icon="link" shortcut="⌥ ⌘ L" onClick={()=>void copyCanvasLink(sheet.id)}>复制页面链接</MenuItem><MenuItem icon="delete" className="native-canvas-page-danger-item" disabled={!canvasWritable||canvasSheets.length<2} title={canvasSheets.length<2?'不能删除最后一个页面。':undefined} onClick={()=>openCanvasDialog(sheet.id,'canvas-delete')}>删除页面</MenuItem></Menu></div>)}
          <hr /><MenuItem icon="plus" disabled={!canvasWritable} onClick={addCanvasPage}>新建页面</MenuItem>
        </Menu><span className="native-toolbar-separator" /></>}<ToolbarTools>{kind==='design'&&<><IconButton icon="select" label="选择 (V)" active={tool === 'select'} onClick={() => {flushText();setPointEditing(null);setTool('select')}} /><IconButton icon="hand" label="手型工具 (H)" active={tool === 'hand'} onClick={() => setTool('hand')} /></>}
        <IconButton icon="text" label="文本" active={tool === 'text'} disabled={!writable || kind!=='design'&&!current} onClick={() => setTool(v => v === 'text' ? 'select' : 'text')} />
        {kind === 'design' ? <><IconButton icon="frame" label="添加画板" disabled={!writable} onClick={addPage} /><IconButton icon="note" label="便签 (N)" active={tool === 'note'} disabled={!writable || kind!=='design'&&!current} onClick={() => setTool('note')} /><span className="native-split-tool"><IconButton icon={lastDrawingTool==='pen'?'pen':'pencil'} label={lastDrawingTool==='pen'?'钢笔':'铅笔'} aria-busy={lastDrawingTool==='pen'?tool==='pen'&&!CanvasVectorTool&&!vectorLoadFailed:penLoading} active={tool === lastDrawingTool} disabled={!writable || kind!=='design'&&!current} onClick={() => setTool(lastDrawingTool)} /><Menu label="绘图工具"><MenuItem icon="pencil" shortcut="P" onClick={() => setTool('pencil')}>铅笔</MenuItem><MenuItem icon="pen" shortcut="⇧ P" onClick={() => setTool('pen')}>钢笔</MenuItem></Menu></span></> : <><IconButton icon="image" label="图片或视频" disabled={!writable || !current} onClick={() => fileInput.current?.click()} /><IconButton icon="table" label="插入表格" disabled={!writable||!current} onClick={()=>addNode('table')} /></>}
        <span className={kind==='design'?'native-split-tool native-shape-split':undefined}>{kind==='design'&&<IconButton icon={shapeTool==='ellipse'?'ellipse':'square'} label="矩形工具" active={tool==='shape'} disabled={!writable||kind!=='design'&&!current} onClick={()=>setTool('shape')} />}
        <Menu label="插入图形" icon={kind === 'design' ? undefined : 'shapes'} disabled={!writable || kind!=='design'&&!current}>
          {kind==='design'?<>
            <MenuItem icon="square" shortcut="R" onClick={()=>{setShapeTool('rect');setTool('shape')}}>矩形</MenuItem>
            <MenuItem icon="ellipse" shortcut="O" onClick={()=>{setShapeTool('ellipse');setTool('shape')}}>椭圆</MenuItem>
            <MenuItem icon="arrow" shortcut="⇧ L" onClick={()=>setTool('arrow')}>箭头</MenuItem>
            <MenuItem icon="line" shortcut="L" onClick={()=>setTool('line')}>直线</MenuItem>
          </>:<>
            <MenuItem icon="square" shortcut="R" onClick={()=>addNode('shape',{shape:'rect'})}>矩形</MenuItem>
            <MenuItem icon="square" shortcut="⇧ R" onClick={()=>addNode('shape',{shape:'rect',style:{fill:'#d6e6ff',borderRadius:16}})}>圆角矩形</MenuItem>
            <MenuItem icon="ellipse" shortcut="O" onClick={()=>addNode('shape',{shape:'ellipse'})}>椭圆</MenuItem>
            <MenuItem icon="diamond" shortcut="D" onClick={()=>addNode('shape',{shape:'diamond'})}>菱形（判断）</MenuItem>
            <hr />{(['right','left','up','down'] as const).map(direction=><MenuItem key={direction} icon="arrow" onClick={()=>addNode('shape',{shape:`arrow-${direction}`})}>{({right:'右箭头',left:'左箭头',up:'上箭头',down:'下箭头'})[direction]}</MenuItem>)}
            <hr /><MenuItem icon="line" shortcut="L" onClick={()=>addNode('line',{height:1,lineEnd:'none'})}>直线</MenuItem><MenuItem icon="arrow" shortcut="⇧ L" onClick={()=>addNode('line',{height:1,lineEnd:'arrow'})}>连接线</MenuItem>
          </>}
        </Menu></span></ToolbarTools>
      </div>
      <div className="native-toolbar-island native-view-tools">
        <div className="native-toolbar-secondary"><ToolbarTools enabled={kind==='design'}><Menu className="native-export-menu" label="导出格式" icon="download" align="end" disabled={!!exporting}><MenuItem disabled={kind==='slides'&&!doc.pageOrder.some(id=>!doc.pages[id].skip)} title={kind==='slides'&&!doc.pageOrder.some(id=>!doc.pages[id].skip)?'所有页面均已跳过，请先恢复至少一页。':undefined} onClick={() => void doExport('pdf')}>便携文档</MenuItem><MenuItem disabled={kind==='slides'&&!doc.pageOrder.some(id=>!doc.pages[id].skip)} title={kind==='slides'&&!doc.pageOrder.some(id=>!doc.pages[id].skip)?'所有页面均已跳过，请先恢复至少一页。':undefined} onClick={() => void doExport('html')}>网页</MenuItem><MenuItem disabled={kind==='slides'&&!doc.pageOrder.some(id=>!doc.pages[id].skip)} title={kind==='slides'&&!doc.pageOrder.some(id=>!doc.pages[id].skip)?'所有页面均已跳过，请先恢复至少一页。':undefined} onClick={() => void doExport('pptx')}>演示文稿</MenuItem><hr /><MenuItem disabled={!current||current.id===canvasContentId} onClick={() => void doExport('png')}>当前{kind === 'design' ? '画板' : '页面'} · 透明位图</MenuItem><MenuItem disabled={!current||current.id===canvasContentId} onClick={() => void doExport('jpeg')}>当前{kind === 'design' ? '画板' : '页面'} · 压缩位图</MenuItem><MenuItem disabled={!current||current.id===canvasContentId} onClick={() => void doExport('svg')}>当前{kind === 'design' ? '画板' : '页面'} · 矢量图</MenuItem>{Boolean(state.original) && <><hr /><MenuItem onClick={() => void downloadSource()}>原始文件</MenuItem></>}</Menu>
        {revisionSeq===undefined&&<span ref={historyAnchor} className="native-history-trigger"><IconButton icon="history" label="版本历史" active={historyOpen} onClick={()=>{flushText();setHistoryOpen(v=>!v)}} /></span>}
        {revisionSeq===undefined&&<span className="native-comments-tools"><IconButton icon="comments" label="评论" active={tool==='comment'} disabled={!writable||kind!=='design'&&!current} onClick={()=>setTool(value=>value==='comment'?'select':'comment')} /><Menu label="评论选项" align="end"><MenuItem onClick={()=>{openComment(null)}}>显示全部评论 <kbd>{commentThreads.filter(thread=>thread.status==='open').length}</kbd></MenuItem></Menu></span>}
        </ToolbarTools></div><div className="native-toolbar-tail">{kind==='design'&&<span className="native-toolbar-separator"/>}<div className="native-toolbar-tail-slot"><div className="native-toolbar-fixed">{kind==='design'?<><span ref={playAnchor}><Menu className="native-play-menu" icon="play" label="播放" minimumWidth={128} offset={6} disabled={!playbackGroups.prototypes.length&&!playbackGroups.others.length} align="end">{([['prototypes','交互原型'],['others','静态画板']] as const).map(([group,label])=>playbackGroups[group].length>0&&<div key={group} role="group" aria-label={label}><div className="native-play-menu-heading" aria-hidden="true">{label}</div>{playbackGroups[group].map(page=><MenuItem key={page.id} onClick={()=>openBoardPreview(page.id,playAnchor.current?.querySelector<HTMLElement>('summary')??undefined)}>{page.title}</MenuItem>)}</div>)}</Menu></span></>:coarsePointer?<IconButton icon="play" label="放映" disabled={!doc.pageOrder.some(id=>!doc.pages[id].skip)} onClick={()=>startPresentation(doc.pageOrder.some(id=>!doc.pages[id].skip&&doc.pages[id].notes.trim().length>0))}/>:<Menu className="native-present-menu" icon="play" label="放映" disabledReason="所有页面均已跳过，请先恢复至少一页。" popupRole="menu" align="end" minimumWidth={240} disabled={!current||!doc.pageOrder.some(id=>!doc.pages[id].skip)}><MenuItem role="menuitem" icon="play" onClick={()=>startPresentation()}>放映</MenuItem><MenuItem role="menuitem" icon="presenter" title={!doc.pageOrder.some(id=>!doc.pages[id].skip&&doc.pages[id].notes.trim())&&(!speakerWindow||speakerWindow.closed)?'还没有讲者备注，请在页面缩略图旁添加备注。':undefined} disabled={!doc.pageOrder.some(id=>!doc.pages[id].skip&&doc.pages[id].notes.trim())&&(!speakerWindow||speakerWindow.closed)} onClick={()=>startPresentation(true)}>使用演讲者视图放映</MenuItem></Menu>}
        {kind==='slides'&&<span className="native-toolbar-separator" />}<IconButton icon="panel" label="显示属性" active={inspectorOpen} onClick={() => { setCommentsOpen(false); setInspectorOpen(v => !v) }} />
{kind==='slides'&&<span className="native-toolbar-separator" />}<Menu className="native-zoom-menu" readoutSizer="100%" label="画布缩放" text={`${Math.round(scale*100)}%`} align="end"><MenuItem icon="fit" shortcut="⌘ 0" onClick={fitViewport}>{canvasMode ? '适应全部画板' : '适应页面'}</MenuItem>{[.25,.5,.75,1,1.5,2,4].map(value => <MenuItem key={value} onClick={() => setZoom(canvasMode ? value*2 : value / (scale/zoom))}>{Math.round(value*100)}%</MenuItem>)}<hr /><MenuItem icon="notes" selected={notesOpen} onClick={() => setNotesOpen(v => !v)}>讲者备注</MenuItem><MenuItem icon="guides" selected={guidesOpen} onClick={() => setGuidesOpen(v => !v)}>布局参考线</MenuItem><MenuItem icon="layers" selected={kind==='design'?inspectorOpen&&inspectorTab==='outline':layersOpen} onClick={() => {if(kind==='design'){setInspectorOpen(true);setInspectorTab('outline')}else setLayersOpen(v=>!v)}}>图层</MenuItem>{kind === 'slides' && <>{compact&&<MenuItem icon="plus" disabled={!writable} shortcut="⌘ M" onClick={()=>setDialog('layouts')}>添加页面</MenuItem>}<MenuItem icon="slides" selected={view === 'slide'} onClick={() => setView('slide')}>幻灯片视图</MenuItem><MenuItem icon="grid" selected={view === 'grid'} onClick={() => setView('grid')}>网格视图</MenuItem><MenuItem icon="frame" selected={view === 'canvas'} onClick={() => setView('canvas')}>画布视图</MenuItem></>}</Menu></div></div></div>
      </div>
      <span className="native-save-status" role="status">{!state.write ? '仅查看' : state.conflict ? '有冲突，修改未保存' : state.pending ? `正在保存 ${state.pending} 项修改` : draftCount||retainedDrafts ? '有未保存的修改' : ''}{agentWorking ? ' · 智能体正在编辑' : ''}</span>
      <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml,video/mp4,video/webm,video/ogg" hidden onChange={event => { const file = event.target.files?.[0]; if (file) void uploadImage(file); event.target.value = '' }} />
    </header>}
    {(state.error || notice || exporting || blockedVectorDrafts || blockedSpeakerNotes || retainedDrafts) && <div className="native-notice" role={state.error||blockedSpeakerNotes||retainedDrafts ? 'alert' : 'status'}>{state.error || notice || exporting || (blockedSpeakerNotes||retainedDrafts?(state.write?'本地修改已保留，可继续编辑后保存，或下载本地副本。':'当前无法保存，本地修改已保留。可下载本地副本。'):undefined) || (vectorEditDrafts.blocked?'未保存的控制点修改已保留。请返回原路径继续编辑，或下载本地副本。':'未保存的钢笔路径已保留。请返回原页面并选择钢笔继续编辑，或下载本地副本。')}{exporting && <button type="button" onClick={() => exportingAbort.current?.abort()}>取消导出</button>}{(state.error||blockedVectorDrafts||blockedSpeakerNotes||retainedDrafts) && <><button type="button" onClick={() => download(new Blob([JSON.stringify(recovery())], { type: 'application/json' }), `${title}.lingxi-recovery.json`)}>下载本地副本</button>{blockedVectorDrafts&&<button type="button" onClick={()=>{vectorTool.current?.discard();pointEditor.current?.discard();vectorDrafts.clear();vectorEditDrafts.clear();setPointEditing(null);setTool('select')}}>丢弃未保存路径</button>}{(state.conflict||blockedSpeakerNotes||retainedDrafts) ? <button type="button" onClick={recoverAndReload}>保留副本并重新载入</button> : <button type="button" disabled={!state.write} onClick={()=>{drafts.flush('save');void session.retry()}}>重试保存</button>}</>}{notice && <button type="button" onClick={() => setNotice('')}>关闭</button>}</div>}
    <div inert={!!focusedBoardId} className="native-workspace">
      {!presenting && kind!=='design' && layersOpen && current && <aside className="native-layers" aria-label="图层"><header><h3>图层</h3><IconButton icon="close" label="关闭图层" onClick={() => setLayersOpen(false)} /></header>{[...current.nodeOrder].reverse().map(value => { const n = current.nodes[value]; return <div className="native-layer" key={value} data-selected={selected.includes(value)}><button type="button" style={{ paddingInlineStart: n.parentId ? 24 : 8 }} onClick={e => setSelected(e.shiftKey ? [...new Set([...selected,value])] : [value])}><EditorIcon name={n.type === 'text' ? 'text' : n.type === 'image' ? 'image' : n.type === 'group' ? 'layers' : n.type === 'note' ? 'note' : 'square'} size={15} /><span>{n.name || n.text || nodeTypeLabels[n.type]}</span></button><IconButton icon="eye" label={n.hidden ? '显示图层' : '隐藏图层'} active={!n.hidden} disabled={!writable} onClick={() => dispatch([{ type:'node.patch',pageId:current.id,nodeId:value,patch:{hidden:!n.hidden} }])} /><IconButton icon="lock" label={n.locked ? '解锁图层' : '锁定图层'} active={n.locked} disabled={!writable} onClick={() => dispatch([{type:'node.patch',pageId:current.id,nodeId:value,patch:{locked:!n.locked}}])} /></div> })}</aside>}

      <div className="native-stage" ref={viewportRef} hidden={presenting || view === 'grid'} onScroll={event => { const element=event.currentTarget,x=element.scrollLeft,y=element.scrollTop,mapping=previousCanvasMapping.current;if(mapping&&mapping.id===activeCanvasId&&mapping.width===element.clientWidth&&mapping.height===element.clientHeight&&!mapping.awaitingLayout)mapping.world=worldCamera({x,y},mapping);setViewport(value=>({...value,x,y})) }} onWheel={event => { if(previousCanvasMapping.current)previousCanvasMapping.current.awaitingLayout=false; if (event.ctrlKey || event.metaKey) { event.preventDefault(); setZoom(value => Math.max(.15, Math.min(4, value * (event.deltaY > 0 ? .9 : 1.1)))) } }}>
        {!presenting&&<>{canvasContentId&&naturalMeasurements.length>0&&<NaturalNoteMeasurements page={canvasContent!} nodes={naturalMeasurements} document={doc} compute={compute} />}
        {!boardIds.length && !canvasContent?.nodeOrder.length && (kind!=='design'||tool==='select'||tool==='hand') && <div className="native-empty"><p>{kind === 'design' ? '添加第一个画板' : '添加第一页'}</p><button type="button" disabled={!writable} onClick={addPage}>开始编辑</button></div>}
        <div onPointerDown={canvasPointerDown} onPointerMove={pointerMove} onPointerUp={e => pointerUp(e)} onPointerCancel={e => pointerUp(e,true)} className={`native-board-space ${!canvasMode ? 'native-single-page' : ''}`} style={canvasMode ? { width: Math.max(boardWidth,canvasExtent.width+2*baseCanvasInset.x)+2*panPadding.x, height: Math.max(boardHeight,canvasExtent.height+baseCanvasInset.y)+2*panPadding.y } : { minWidth: '100%', minHeight: '100%' }}>
          {(canvasMode&&renderedCanvasContent?[...boards,renderedCanvasContent]:boards).map(page => <div key={page.id} className={`native-page-shell ${page.id===canvasContentId?'native-free-canvas-shell':''}`} data-page-id={!canvasMode || scale>=.15 || page.id===pageId || page.id===canvasContentId ? page.id : undefined} data-artboard-id={page.id===canvasContentId?undefined:page.id} data-board-selected={kind==='design'&&selected.length===0&&selectedPages.includes(page.id)||undefined} data-current={page.id===(kind==='design'&&canvasMode?highlightedBoard:pageId)} style={{ width: page.width * scale, height: page.height * scale, ...(canvasMode ? { position: 'absolute', left: (page.x - origin.x + 64) * scale+canvasInset.x, top: (page.y - origin.y + 64) * scale+canvasInset.y } : {}) }}>
            {canvasMode && page.id!==canvasContentId && (kind==='design'?<BoardTitle heading={{onPointerDown:event=>boardTransforms.start(event,page.id),onClickCapture:boardTransforms.click,onKeyDown:event=>{if((event.target as Element).closest('.native-board-label'))boardTransforms.key(event,page.id)}}} pageId={page.id} title={page.title} writable={canvasWritable} onSelect={event=>choosePage(page.id,event.shiftKey,false,false)} getBase={()=>session.getSnapshot().document!} commit={commitCode} retain={operations=>session.retainDraft(operations)}><span className="native-board-heading-actions"><button type="button" className="native-icon-button" data-preview-open={page.id} aria-label={`全窗口查看画板 ${page.title}`} title="全窗口查看画板" onClick={event=>openBoardPreview(page.id,event.currentTarget)}><EditorIcon name="fit" size={14}/></button><BoardExportMenu page={page} allPageIds={boardIds} selectedPageIds={pageSelection.filter(id=>boardIds.includes(id))} busy={!!exporting} onExport={(format,choice)=>void doExport(format,choice)}/></span></BoardTitle>:<button type="button" className="native-board-label" onClick={()=>selectPage(page.id)}>{page.title}</button>)}
            {kind==='design'&&canvasMode&&tool==='select'&&!selected.length&&selectedBoardIds.includes(page.id)&&(selectedBoardIds.length===1?<BoardTransformHandles page={page} writable={canvasWritable} start={boardTransforms.start} onKey={boardTransforms.key}/>:<div className="native-board-member-selection" aria-hidden="true"/>)}
            {canvasMode && page.id!==canvasContentId && scale < .15 && page.id!==pageId ? <div className="native-page-scaled" style={{ width: page.width, height: page.height, borderRadius:pageRadiusCss(page.radius), transform: `scale(${scale})` }}><button type="button" className="native-board-thumbnail" data-page-target={page.id} aria-label={`选择画板 ${page.title}`} onClick={()=>selectPage(page.id)} onDoubleClick={()=>{setZoom(1);selectPage(page.id)}}><PageThumbnail page={state.loadedPageIds.includes(page.id) ? page : state.previews?.[page.id] ?? page} document={doc} loaded={state.loadedPageIds.includes(page.id)||!!state.previews?.[page.id]} /></button></div> : <div className="native-page-scaled" style={{ width: page.width, height: page.height, borderRadius:pageRadiusCss(page.radius), transform: `scale(${scale})` }} onPointerDown={event => pointerDown(event, page)} onPointerMove={pointerMove} onPointerUp={event => pointerUp(event)} onPointerCancel={event => pointerUp(event, true)} onDoubleClick={event => { const target = (event.target as HTMLElement).closest<HTMLElement>('[data-node-id]'); const node = target && page.nodes[target.dataset.nodeId ?? '']; if(node?.path&&writable){beginPointEditing(node,page);return} if (node && writable && (node.type==='image'||node.type==='video')) { setPageId(page.id); setSelected([node.id]); beginCrop(node,page); return } if (node && writable && (node.type === 'text' || node.type === 'note' || node.type === 'table')) { if (editingId === node.id && textPage.current === page.id) return; setPageId(page.id); setSelected([node.id]); textBase.current = session.getSnapshot().document; textPage.current = page.id; setEditingId(node.id); if(node.type==='table'){const cell=(event.target as HTMLElement).closest<HTMLElement>('td,th');if(cell)setTimeout(()=>{if(cell.isConnected&&cell.isContentEditable)cell.focus({preventScroll:true})},0)} } }}>
              <PageContent document={renderDocument ?? doc} page={page} pageVersion={session.getPageVersion(page.id)} revisionSeq={revisionSeq} vectorEditingId={CanvasPointTool&&pointEditing?.pageId===page.id?pointEditing.nodeId:undefined} cropEditingId={cropping?.id} compute={compute} visibleNodeIds={visibleElements[page.id]?.ids ?? new Set()} contentBottom={visibleElements[page.id]?.bottom} editingId={page.id === pageId ? editingId : null} onTextChange={changeText} onFinishText={finishText} onCellChange={changeCell} onFlowSize={flowSize} presenting={presenting} />
              {canvasMode && page.id!==canvasContentId && <PageContent canvasOnly document={renderDocument ?? doc} page={page} pageVersion={session.getPageVersion(page.id)} revisionSeq={revisionSeq} vectorEditingId={CanvasPointTool&&pointEditing?.pageId===page.id?pointEditing.nodeId:undefined} cropEditingId={cropping?.id} compute={compute} visibleNodeIds={visibleElements[page.id]?.ids ?? new Set()} editingId={page.id === pageId ? editingId : null} onTextChange={changeText} onFinishText={finishText} onCellChange={changeCell} />}
              {!presenting && cropping && page.id === pageId && <Suspense fallback={null}><CropEditor key={cropping.id} node={cropping} frame={croppingFrame??readNodeFrame(viewportRef.current,page,cropping,scale)} pageId={page.id} scale={scale} base={session.getSnapshot().document!} onCommit={dispatch} onClose={()=>setCropping(null)} /></Suspense>}
              {!presenting && guidesOpen && page.guides?.map((guide,index) => <div key={index} className={`native-guide native-guide-${guide.axis}`} style={guide.axis === 'x' ? { left: guide.position } : { top: guide.position }} />)}
              {!presenting && guidesOpen && page.layoutGuides?.filter(g=>!g.hidden).map((guide,index)=>{const horizontal=guide.kind==='rows',dimension=horizontal?page.height:page.width,step=guide.kind==='grid'?Math.max(1,guide.size):Math.max(1,(dimension-2*guide.margin+guide.gutter)/guide.count),size=guide.kind==='grid'?1:Math.max(1,step-guide.gutter);return guide.kind==='grid' ? <svg key={`layout-${index}`} className="native-layout-guide" width={page.width} height={page.height}><defs><pattern id={`guide-${page.id}-${index}`} width={step} height={step} patternUnits="userSpaceOnUse"><path d={`M ${step} 0 L 0 0 0 ${step}`} fill="none" stroke={guide.color} strokeWidth="1" /></pattern></defs><rect width="100%" height="100%" fill={`url(#guide-${page.id}-${index})`} /></svg> : <div key={`layout-${index}`} className="native-layout-guide">{Array.from({length:guide.count},(_,i)=><div key={i} style={{position:'absolute',background:guide.color,...(horizontal?{top:guide.margin+i*step,left:0,width:page.width,height:size}:{left:guide.margin+i*step,top:0,width:size,height:page.height})}} />)}</div>})}
              {!presenting&&penPreview&&page.id===pageId&&<svg data-native-path-preview aria-hidden="true" className="native-drawing-preview" width={penPreview.w} height={penPreview.h} style={{left:penPreview.x,top:penPreview.y}} viewBox={`0 0 ${penPreview.w} ${penPreview.h}`}><path d={penPreview.d} fill="none" stroke="#8a8378" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /></svg>}
              {!presenting && !penPreview && drawingPreview && page.id === pageId && <svg className="native-drawing-preview" width={page.width} height={page.height}>{gesture.current?.tool==='shape'?(()=>{const first=drawingPreview[0],last=drawingPreview.at(-1)!,x=Math.min(first.x,last.x),y=Math.min(first.y,last.y),w=Math.abs(last.x-first.x),h=Math.abs(last.y-first.y);return shapeTool==='ellipse'?<ellipse cx={x+w/2} cy={y+h/2} rx={w/2} ry={h/2} fill="#b6b0a7" />:<rect x={x} y={y} width={w} height={h} rx={8} fill="#b6b0a7" />})():<polyline points={drawingPreview.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="2" />}</svg>}
              {!presenting && commentThreads.filter(t => t.status === 'open').map((thread,index) => { const anchor = decodeCommentAnchor(thread.anchor); const point = anchor?.pageId === page.id ? commentPositions[thread.id] ?? commentPoint(anchor,page) : null; return point && <button type="button" key={thread.id} className="native-comment-pin" aria-label={`评论 ${index+1}：${thread.label}`} style={{ left: point.x, top: point.y, transform: `scale(${1/scale})` }} onClick={() => {openComment(anchor,thread.id)}}>{index+1}</button> })}
              {!presenting && tool==='select' && page.id === pageId && <div className="native-interaction-layer" data-interaction-layer>{selectedNodes.filter(node => node.id !== editingId && node.id !== cropping?.id && node.id!==pointEditing?.nodeId).map(node => { const frame=preview?.frames?.[node.id];let x = frame?.x??node.x, y = frame?.y??node.y; let parent = node.parentId ? page.nodes[node.parentId] : undefined; while (parent) { x += parent.x; y += parent.y; parent = parent.parentId ? page.nodes[parent.parentId] : undefined } return <div key={node.id} className="native-selection" style={{ left: x + (preview && !frame && !preview.resize && !gesture.current?.positionPins?.[node.id]?.bothX ? preview.dx : 0), top: y + (preview && !frame && !preview.resize && !gesture.current?.positionPins?.[node.id]?.bothY ? preview.dy : 0), width: frame?.width??Math.max(node.css?0:16,node.width+(preview?.resize?preview.dx:0)),height:frame?.height??Math.max(node.css?0:16,node.height+(preview?.resize?preview.dy:0)), transform: `rotate(${node.rotation}deg)`, borderWidth: 1.5 / scale }}>{writable && !node.locked && (kind!=='design'||page.id===canvasContentId||scale>=.25) && <>{(['nw','n','ne','e','se','s','sw','w'] as const).map(handle => <button type="button" key={handle} className={`native-resize-handle native-handle-${handle}`} style={{ width: 7 / scale, height: 7 / scale }} aria-label={`调整元素${resizeHandleLabels[handle]}`} onPointerDown={event => { event.stopPropagation(); gesture.current = { base: session.getSnapshot().document!, type: 'resize', handle, startX: event.clientX, startY: event.clientY, pageId: page.id, nodes: selectedNodes.filter(item => !item.locked), moved: false,positionPins:capturePositionPins(page,selectedNodes.filter(item=>!item.locked),page.id===canvasContentId) }; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={pointerMove} onPointerUp={event => pointerUp(event)} onPointerCancel={event => pointerUp(event, true)} />)}<button type="button" className="native-rotate-handle" style={{ width: 10/scale, height: 10/scale, top: -24/scale }} aria-label="旋转元素" onPointerDown={event => { event.stopPropagation(); gesture.current = { base: session.getSnapshot().document!, type: 'rotate', startX: event.clientX, startY: event.clientY, pageId: page.id, nodes: [node], moved: false }; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={pointerMove} onPointerUp={event => pointerUp(event)} onPointerCancel={event => pointerUp(event,true)} /></>}</div> })}{marquee && <div className="native-marquee" style={marquee as CSSProperties} />}</div>}
            </div>}
          </div>)}
          {kind==='design'&&canvasMode&&tool==='select'&&!selected.length&&selectedBoardIds.length>1&&(()=>{const frame=!boardTransforms.preview.copy&&boardTransforms.preview.groupFrame||boardBounds(selectedBoardIds.map(id=>displayPages[id]));if(!frame)return null;const page={...doc.pages[selectedBoardIds[0]],title:`${selectedBoardIds.length} 个画板`};return <div className="native-board-group-selection" data-board-group-selection style={{position:'absolute',left:(frame.x-origin.x+64)*scale+canvasInset.x,top:(frame.y-origin.y+64)*scale+canvasInset.y,width:frame.width*scale,height:frame.height*scale}}><BoardTransformHandles group page={page} writable={canvasWritable} start={boardTransforms.start} onKey={boardTransforms.key}/></div>})()}
          {boardTransforms.preview.copy&&boardTransforms.preview.activeIds.map(id=>{const frame=boardTransforms.preview.frames[id];return frame&&<div key={id} className="native-board-copy" aria-hidden="true" data-board-copy={id} style={{left:(frame.x-origin.x+64)*scale+canvasInset.x,top:(frame.y-origin.y+64)*scale+canvasInset.y,width:frame.width*scale,height:frame.height*scale,borderWidth:2*scale,borderRadius:4*scale}}/>})}
          {boardTransforms.preview.guides.map(guide=><div key={guide.axis} className={`native-board-snap native-board-snap-${guide.axis}`} aria-hidden="true" style={guide.axis==='x'?{left:0,transform:`translateX(${(guide.at-origin.x+64)*scale+canvasInset.x}px)`}:{top:0,transform:`translateY(${(guide.at-origin.y+64)*scale+canvasInset.y}px)`}}/>)}
          <BoardSpacingGuides gaps={boardTransforms.preview.gaps} scale={scale} origin={origin} inset={canvasInset}/>
          {!presenting&&tool==='select'&&CanvasPointTool&&pointEditing&&doc.pages[pointEditing.pageId]?.nodes[pointEditing.nodeId]?.path&&canvasPageOf(doc.pages[pointEditing.pageId])===activeCanvasId&&<CanvasPointTool key={JSON.stringify(pointEditing)} ref={pointEditor} node={doc.pages[pointEditing.pageId].nodes[pointEditing.nodeId]} pageId={pointEditing.pageId} drafts={vectorEditDrafts} writable={writable} isWritable={()=>{const snapshot=session.getSnapshot();return !!snapshot.document&&snapshot.write&&!snapshot.conflict}} isPanning={()=>space.current} pan={event=>{const page=doc.pages[pointEditing.pageId];if(page)pointerDown(event,page,true)}} capture={pointCapture} view={pointView} commit={commitPointEdit} done={()=>setPointEditing(null)} focus={()=>editorRoot.current?.focus({preventScroll:true})} announce={text=>setAnnouncement(current=>({id:current.id+1,text}))} error={setNotice} />}
          {kind==='design'&&!presenting&&tool==='pen'&&CanvasVectorTool&&<CanvasVectorTool key={activeCanvasId} drafts={vectorDrafts} canvasPageId={activeCanvasId} isWritable={()=>{const snapshot=session.getSnapshot();return !!snapshot.document&&snapshot.write&&!snapshot.conflict}} ref={vectorTool} scale={scale} offsetX={canvasInset.x+(64-origin.x)*scale} offsetY={canvasInset.y+(64-origin.y)*scale} writable={canvasWritable&&(!canvasContentId||state.loadedPageIds.includes(canvasContentId))} toWorld={canvasWorldPoint} begin={()=>{flushText();setSelected([]);setEditingId(null);const document=session.getSnapshot().document;return document?{document,canvasPageId:activeCanvasId}:undefined}} commit={commitCanvasVector} done={()=>setTool('select')} announce={text=>setAnnouncement(current=>({id:current.id+1,text}))} error={setNotice} focus={()=>editorRoot.current?.focus({preventScroll:true})} />}
        </div>
      </>}</div>
      {!presenting && view === 'grid' && <PageRail grid document={doc} current={pageId} selected={pageSelection} loadedPageIds={state.loadedPageIds} previews={state.previews} writable={writable} onSelect={choosePage} onOpen={value => { selectPage(value); setView('slide') }} onReorder={pageIds => dispatch([{ type: 'pages.reorder', pageIds }])} onAction={pageAction} onVisible={()=>{}} />}
      {!presenting && inspectorOpen && (NativeInspector ? <NativeInspector measureArtboardHeight={()=>{
        if(!current||!writable)return
        const bounds=elementBounds(current,false).filter(value=>{let node:ArtifactNode|undefined=current.nodes[value.id];while(node){if(node.hidden||node.scope==='canvas')return false;node=node.parentId?current.nodes[node.parentId]:undefined}return true})
        let bottom=Math.max(0,...bounds.map(value=>value.y+value.height))
        const content=viewportRef.current?.querySelector<HTMLElement>(`[data-page-id="${current.id}"] [data-content-layer]:not(.native-canvas-content)`)
        if(content){const frame=content.getBoundingClientRect(),factor=frame.width/current.width;if(factor)for(const child of content.querySelectorAll<HTMLElement>('.native-node')){const box=child.getBoundingClientRect();bottom=Math.max(bottom,(box.bottom-frame.top)/factor,(box.top-frame.top)/factor+child.scrollHeight)}}
        return bottom
      }} panelWidth={inspectorWidth} setPanelWidth={setInspectorWidth} outline={{pageIds:boardIds,currentId:current?.id,selectedPages:selectedBoardIds,loadedPageIds:state.loadedPageIds,height:outlineHeight,setHeight:setOutlineHeight,selectPage:choosePage,openContext:(value,nodeId,point,opener)=>{flushText();setPointEditing(null);setEditingId(null);setPageId(value);if(!nodeId)setSelected([]);else if(current?.id!==value||!selected.includes(nodeId))setSelected([nodeId]);const rect=editorRoot.current!.getBoundingClientRect();contextReturn.current=opener;setContextMenu({x:Math.max(4,Math.min(rect.width-228,point.x-rect.left)),y:Math.max(4,Math.min(rect.height-360,point.y-rect.top))});requestAnimationFrame(()=>menuRef.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus())},selectNodes:(value,ids)=>{if(current?.id!==value)selectPage(value);else{flushText();setPointEditing(null);setEditingId(null);setCropping(null)}setSelected(ids)},ensurePage:async value=>{await session.ensurePage(value);if(!session.getSnapshot().loadedPageIds.includes(value))throw new Error('图层未能加载。')}}} onHistory={direction=>void session.undoRedo(direction)} retainDraft={operations=>session.retainDraft(operations)} codeDrafts={codeDraftAccess} commitCode={commitCode} onNotice={setNotice} inspectorTab={inspectorTab} setInspectorTab={setInspectorTab} setInspectorOpen={open=>{if(open)setInspectorOpen(true);else closeInspector()}} typography={state.typography} loadedPageIds={state.loadedPageIds} doc={doc} primary={primary} current={current&&!boardTransforms.preview.copy&&boardTransforms.preview.frames[current.id]?{...current,...boardTransforms.preview.frames[current.id]}:current} primaryPadding={primaryPadding} kind={kind} canvasContentId={canvasContentId} writable={writable} selected={selected} setSelected={setSelected} inspectorBase={inspectorBase} fileInput={fileInput} replaceImage={replaceImage} dispatch={dispatch} inspectDispatch={inspectDispatch} patchNode={patchNode} beginCrop={beginCrop} reorderLayer={reorderLayer} ungroup={ungroup} groupSelection={groupSelection} align={align} distribute={distribute} deleteSelection={deleteSelection} pasteNodes={pasteNodes} selectedWithChildren={selectedWithChildren} getBase={()=>session.getSnapshot().document} beginInspector={()=>{if(!editorRoot.current?.querySelector('.native-color-popover,.native-font-popup,.native-font-variants details[open]'))inspectorBase.current=session.getSnapshot().document}} /> : <aside className="native-inspector" aria-label="属性面板"><div role="status" className="native-loading">正在加载属性…</div><IconButton icon="close" label="关闭属性" onClick={closeInspector}/></aside>)}


    </div>
    {!presenting && kind === 'slides' && (!compact || compactRailOpen) && <footer className="native-footer"><div className="native-rail-toolbar"><IconButton icon="plus" label="添加页面" disabled={!writable} onClick={() => setDialog('layouts')} /><IconButton icon="notes" label="讲者备注" active={notesOpen} onClick={() => setNotesOpen(v => !v)} /><span className="native-rail-toolbar-spacer" /><IconButton icon="slides" label="幻灯片视图" active={view === 'slide'} onClick={() => setView('slide')} /><IconButton icon="grid" label="网格视图" active={view === 'grid'} onClick={() => setView('grid')} /><IconButton icon="chevron" label={compact || railOpen ? '隐藏页面缩略图' : '显示页面缩略图'} onClick={() => compact ? toggleCompactRail(false) : setRailOpen(v => !v)} /></div>{(compact || railOpen) && view === 'slide' && <PageRail document={doc} current={pageId} selected={pageSelection} loadedPageIds={state.loadedPageIds} previews={state.previews} writable={writable} onSelect={choosePage} onOpen={selectPage} onReorder={pageIds => dispatch([{type:'pages.reorder',pageIds}])} onAction={pageAction} onVisible={()=>{}} />}</footer>}
    {!presenting&&kind==='slides'&&compact&&!compactRailOpen&&<nav className="native-compact-navigation" aria-label="页面切换"><IconButton icon="previous" label="上一页" disabled={!current||doc.pageOrder.indexOf(current.id)===0} onClick={()=>{if(current)selectPage(doc.pageOrder[doc.pageOrder.indexOf(current.id)-1])}} /><span>{current?doc.pageOrder.indexOf(current.id)+1:0} / {doc.pageOrder.length}</span><IconButton icon="next" label="下一页" disabled={!current||doc.pageOrder.indexOf(current.id)===doc.pageOrder.length-1} onClick={()=>{if(current)selectPage(doc.pageOrder[doc.pageOrder.indexOf(current.id)+1])}} /><i /><IconButton icon="notes" label="讲者备注" active={notesOpen} onClick={()=>setNotesOpen(v=>!v)} /><IconButton icon="presenter" label="显示页面缩略图" onClick={()=>toggleCompactRail(true)} /></nav>}
    {!presenting && notesOpen && current && <aside inert={!!focusedBoardId} className="native-notes" aria-label="讲者备注面板"><header><h3>讲者备注 · {doc.pageOrder.indexOf(current.id)+1} / {doc.pageOrder.length}</h3><IconButton icon="close" label="关闭备注" onClick={() => setNotesOpen(false)} /></header><SpeakerNotesField key={`${current.id}:${speakerNoteDrafts.resetGeneration}`} page={current} store={speakerNoteDrafts} writable={state.write&&!state.conflict} getBase={()=>session.getSnapshot().document!} commit={commitSpeakerNote}/></aside>}

    {(presenting || speakerWindow) && current && (SlidesPresentation?<SlidesPresentation active={presenting} fullscreenSession={presentationFullscreen} coarsePointer={coarsePointer} onToggleSpeaker={()=>{if(speakerWindow&&!speakerWindow.closed){speakerWindow.close();return false}return !!openSpeakerWindow()}} document={renderDocument!} pageId={current.id} compute={compute} loadedPageIds={state.loadedPageIds} pageVersion={session.getPageVersion} revisionSeq={revisionSeq} notes={notesOpen} getSpeakerWindow={()=>speakerWindow} notesWritable={state.write&&!state.conflict} getNotesBase={()=>session.getSnapshot().document!} onNotesCommit={commitSpeakerNote} noteDrafts={speakerNoteDrafts} saveError={state.error||speakerNoteError} saveConflict={state.conflict} saving={state.pending>0} onDownloadRecovery={downloadRecovery} onRecover={recoverAndReload} onCheckAccess={()=>void session.open()} onSave={()=>{drafts.flush('save');void session.retry()}} ensurePage={async value=>{await session.ensurePage(value);if(!session.getSnapshot().loadedPageIds.includes(value))throw new Error('幻灯片未能加载。')}} onNavigate={selectPage} onClose={()=>{setPresenting(false);if(window.document.fullscreenElement)void window.document.exitFullscreen();queueMicrotask(()=>editorRoot.current?.querySelector<HTMLElement>('[aria-label="放映"]')?.focus({preventScroll:true}))}} onError={setNotice}/>:presenting?<div className="native-loading" role="status">正在准备放映…</div>:null)}
    {contextMenu && <div ref={menuRef} role="menu" aria-label="编辑操作" tabIndex={-1} className="native-context-menu native-menu-popup" style={{left:contextMenu.x,top:contextMenu.y}} onClick={() => closeContextMenu(true)} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeContextMenu(true);return}if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;event.preventDefault();event.stopPropagation();const items=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],index=items.indexOf(window.document.activeElement as HTMLButtonElement);items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowUp'?-1:1)+items.length)%items.length]?.focus()}}>
      <MenuItem role="menuitem" icon="copy" disabled={!selected.length} shortcut="⌘ C" onClick={copySelection}>复制</MenuItem><MenuItem role="menuitem" icon="copy" disabled={!writable || !selected.length} shortcut="⌘ D" onClick={() => pasteNodes(selectedWithChildren())}>创建副本</MenuItem><MenuItem role="menuitem" disabled={!writable || !clipboard.current.length} shortcut="⌘ V" onClick={() => pasteNodes(clipboard.current)}>粘贴</MenuItem><hr />
      <MenuItem role="menuitem" icon="layers" disabled={!writable || selected.length<2} shortcut="⌘ G" onClick={groupSelection}>组合</MenuItem><MenuItem role="menuitem" disabled={!writable || primary?.type!=='group'} shortcut="⌘ ⇧ G" onClick={ungroup}>取消组合</MenuItem><MenuItem role="menuitem" icon="up" disabled={!writable || !selected.length} onClick={() => reorderLayer(true)}>置于顶层</MenuItem><MenuItem role="menuitem" icon="down" disabled={!writable || !selected.length} onClick={() => reorderLayer(false)}>置于底层</MenuItem><hr />
      <MenuItem role="menuitem" icon="left" disabled={!writable || !selected.length} onClick={() => align('left')}>左对齐</MenuItem><MenuItem role="menuitem" icon="center" disabled={!writable || !selected.length} onClick={() => align('center')}>水平居中</MenuItem><MenuItem role="menuitem" icon="flipX" disabled={!writable || !primary || primary.type==='note'} onClick={() => patchNode({flipX:!primary?.flipX})}>水平翻转</MenuItem><MenuItem role="menuitem" icon="flipY" disabled={!writable || !primary || primary.type==='note'} onClick={() => patchNode({flipY:!primary?.flipY})}>垂直翻转</MenuItem><hr />
      <MenuItem role="menuitem" icon="lock" disabled={!writable||!primary} onClick={()=>{if(current&&primary)dispatch([{type:'node.patch',pageId:current.id,nodeId:primary.id,patch:{locked:!primary.locked}}],doc)}}>{primary?.locked?'解锁图层':'锁定图层'}</MenuItem><MenuItem role="menuitem" icon="comments" disabled={!writable} onClick={() => { if(current)openComment({pageId:current.id,...(primary?{nodeId:primary.id}:{}),x:.5,y:.5}) }}>添加评论</MenuItem><MenuItem role="menuitem" icon="delete" disabled={!writable || !selected.length} shortcut="⌫" onClick={deleteSelection}>删除</MenuItem>
    </div>}
    {!presenting && commentsOpen && <><span ref={commentAttachment} className="native-comment-attachment" style={commentAnchor&&commentAttachmentPoint?{left:commentAttachmentPoint.x+41,top:commentAttachmentPoint.y-3}:{right:12,top:64}} /><Suspense fallback={<div className="native-notice" role="status">正在加载评论…</div>}><CommentsPanel key={commentSession} drafts={commentDrafts} observedThreads={commentThreads} onDraftChange={onCommentDraft} artifactId={artifactId} writable={focusedBoardId?canvasWritable&&state.loadedPageIds.includes(focusedBoardId):writable} anchor={commentAnchor} threadId={activeCommentThread} anchorElement={commentAttachment} label={(commentAnchor?doc.pages[commentAnchor.pageId]?.title:focusedBoardId?doc.pages[focusedBoardId]?.title:current?.title) ?? title} onClose={closeComments} onPlaced={threadId=>{if(commentSession!==commentSessionRef.current)return;if(threadId){if(commentAnchor)setActiveCommentThread(threadId)}else closeComments(true)}} onThreads={setCommentThreads} onNavigate={value => { const a = decodeCommentAnchor(value); if (a) { if(focusedBoardId&&doc.pageOrder.includes(a.pageId)){setFocusedBoardId(a.pageId);setPageId(a.pageId)}else{if(focusedBoardId)closeBoardPreview();selectPage(a.pageId)} if (a.nodeId) setSelected([a.nodeId]) } }} /></Suspense></>}
    {historyOpen&&revisionSeq===undefined&&<Suspense fallback={<div role="status" className="native-notice">正在加载版本…</div>}><VersionHistory artifactId={artifactId} kind={kind} title={title} documentSeq={doc.seq} pageNames={Object.fromEntries(doc.pageOrder.map(id=>[id,doc.pages[id].title]))} dirty={draftCount>0||state.pending>0} writable={writable} anchor={focusedBoardId?boardHistoryAnchor:historyAnchor} onClose={closeHistory} onRestored={()=>session.refresh()} /></Suspense>}
    {dialog==='canvas-rename'&&<Modal editorBoundary initialFocusSelector="input" className="native-canvas-page-dialog native-canvas-rename" title="重命名页面" onClose={closeCanvasDialog}><div className="native-canvas-name-form"><label className="native-sr-only" htmlFor="canvas-page-name">页面名称</label><input id="canvas-page-name" aria-label="页面名称" readOnly={!state.write||state.conflict} autoFocus onFocus={event=>event.currentTarget.select()} value={dialogText} maxLength={120} onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing&&event.keyCode!==229){event.preventDefault();if(!event.repeat)renameCanvasPageAction()}}} onChange={event=>setDialogText(event.target.value)} />{canvasDialogError&&<p role="alert">{canvasDialogError}</p>}<footer><button type="button" onClick={closeCanvasDialog}>取消</button><button className="native-primary" type="button" onClick={renameCanvasPageAction} disabled={!canvasWritable||!dialogText.trim()}>重命名</button></footer></div></Modal>}
    {dialog==='canvas-delete'&&<Modal role="alertdialog" showClose={false} initialFocusSelector="[data-canvas-delete-cancel]" editorBoundary className="native-canvas-page-dialog native-canvas-delete" title={`删除页面“${canvasSheets.find(sheet=>sheet.id===canvasDialogId)?.name??dialogText}”？`} onClose={closeCanvasDialog}><p>此页面包含 {doc.pageOrder.filter(id=>canvasPageOf(doc.pages[id])===canvasDialogId).length} 个画板，页面内的画板、便签和其他对象也会删除。删除后可撤销恢复。</p>{canvasDialogError&&<p role="alert">{canvasDialogError}</p>}<div className="native-inspector-actions"><button data-canvas-delete-cancel type="button" disabled={canvasDeleting} onClick={closeCanvasDialog}>取消</button><button type="button" className="native-canvas-delete-confirm" disabled={!canvasWritable||canvasDeleting||canvasSheets.length<2} onClick={()=>void removeCanvasPage()}>{canvasDeleting?'正在删除…':'删除页面'}</button></div></Modal>}
    {dialog === 'layouts' && <Modal title="版式" onClose={() => setDialog(null)}><div className="native-layout-picker">{SLIDE_LAYOUTS.map(layout => <button type="button" key={layout.id} onClick={() => { const page = {...createPage(id(), `页面 ${doc.pageOrder.length+1}`),...(current?{width:current.width,height:current.height,background:current.background,themeBackground:current.themeBackground,section:current.section}:{})}; const nodes = layoutSlide(layout.id,page,id); page.nodes=Object.fromEntries(nodes.map(n => [n.id,n])); page.nodeOrder=nodes.map(n => n.id); dispatch([{type:'page.insert',page,index:current ? doc.pageOrder.indexOf(current.id)+1 : undefined}]); setPageId(page.id); setView('slide'); setSelected([]); setDialog(null) }}><span className={`native-layout-preview native-layout-${layout.id}`} aria-hidden="true">{(() => { const p=createPage(`preview-${layout.id}`); const nodes=layoutSlide(layout.id,p,()=>id()); p.nodes=Object.fromEntries(nodes.map(n=>[n.id,n])); p.nodeOrder=nodes.map(n=>n.id); return <PageThumbnail page={p} document={doc} loaded /> })()}</span>{layout.title}</button>)}</div></Modal>}
    {(dialog === 'rename' || dialog === 'section') && <Modal title={dialog === 'rename' ? '重命名画板' : '添加节'} onClose={() => setDialog(null)}><form className="native-name-form" onSubmit={e => { e.preventDefault(); if (!dialogText.trim()) return; dispatch(pageSelection.map(pageId => ({type:'page.patch',pageId,patch:dialog === 'rename' ? {title:dialogText.trim()} : {section:dialogText.trim()}}))); setDialog(null) }}><label>名称<input aria-label="名称" autoFocus value={dialogText} maxLength={dialog === 'section' ? 200 : 1000} onChange={e => setDialogText(e.target.value)} /></label><button className="native-primary" type="submit">保存</button></form></Modal>}
    <span className="native-visually-hidden" aria-live="polite" aria-atomic="true"><span key={announcement.id}>{announcement.text}</span></span>
  </section></DraftContext.Provider></EditorPaletteContext.Provider></EditorColorSessionContext.Provider></ArtifactAssetReadContext.Provider>
}
