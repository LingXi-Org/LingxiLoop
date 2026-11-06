import { useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { RadioGroup } from '@base-ui/react/radio-group'
import { Radio } from '@base-ui/react/radio'
import type { ArtifactDocument, ArtifactPage } from '../../../../shared/artifact-document'
import { commentPoint, decodeCommentAnchor, type NativeCommentAnchor } from '../../../../shared/artifact-comment-anchor'
import { PageContent } from './renderer'
import type { NativeCompute } from './compute'
import type { EditorComment } from './CommentsPanel'
import { anchorInFrame, pointInFrame, readNodeFrame } from './rendered-geometry'
import { useVisibleElements } from './use-visibility'
import { IconButton } from './EditorPrimitives'

const EMPTY_SELECTION: string[] = []

export interface BoardPreviewView { scale: number; width: number; height: number }
export interface BoardPreviewProps {
  document: ArtifactDocument
  page: ArtifactPage
  compute: NativeCompute
  loaded: boolean
  pageVersion?: string
  revisionSeq?: string
  viewportRef: RefObject<HTMLDivElement | null>
  actions: ReactNode
  comments: EditorComment[]
  commenting: boolean
  error: string
  onClose(): void
  onSave(): void
  onView(view: BoardPreviewView): void
  onComment(anchor: NativeCommentAnchor, threadId?: string): void
  onError(error: string): void
}
export default function BoardPreview({ document, page, compute, loaded, pageVersion, revisionSeq, viewportRef, actions, comments, commenting, error, onClose, onSave, onView, onComment, onError }: BoardPreviewProps) {
  const root = useRef<HTMLElement>(null)
  const [fit, setFit] = useState(true)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    root.current?.querySelector<HTMLButtonElement>('[aria-label="返回画布"]')?.focus({ preventScroll: true })
    const element = viewportRef.current
    if (!element) return
    const measure = () => setSize(old => old.width === element.clientWidth && old.height === element.clientHeight ? old : { width: element.clientWidth, height: element.clientHeight })
    const observer = new ResizeObserver(measure)
    observer.observe(element); measure()
    return () => observer.disconnect()
  }, [viewportRef])
  const scale = fit ? Math.max(.001, Math.min(1, (size.width - 48) / page.width, (size.height - 48) / page.height)) : 1
  useLayoutEffect(() => onView({ ...size, scale }), [size, scale, onView])
  const viewport = useMemo(() => ({ ...size, x: 0, y: 0 }), [size])
  const pages = useMemo(() => loaded ? [page] : [], [loaded, page])
  const visible = useVisibleElements({ pages, revision: document.seq, viewport, scale, root: viewportRef, compute, pageId: page.id, selected: EMPTY_SELECTION, editingId: null, onError })
  return <section ref={root} className="native-board-preview" data-native-editor-boundary role="region" aria-label="画板全窗口预览" onKeyDown={event => {
    if ((event.target as Element).closest('[data-native-editor-boundary]') !== event.currentTarget) return
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); onSave(); return }
    if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); onClose(); return }
  }}>
    <header className="native-board-preview-header">
      <IconButton icon="previous" label="返回画布" onClick={onClose} />
      <span className="native-board-preview-title">{page.title}</span>
      <div className="native-board-preview-actions">{actions}<RadioGroup className="native-board-preview-fit" aria-label="画板预览缩放" value={fit ? 'fit' : 'fill'} onValueChange={value => setFit(value === 'fit')}>
        <Radio.Root value="fill">填满</Radio.Root>
        <Radio.Root value="fit">适应</Radio.Root>
      </RadioGroup></div>
    </header>
    <div ref={viewportRef} className="native-board-preview-viewport" data-fit={fit}>
      {!loaded ? <p role={error ? 'alert' : 'status'}>{error || '正在加载画板…'}</p> : <div className="native-board-preview-layout" style={fit ? { width: 0, height: 0, transform: `matrix(${scale},0,0,${scale},${(size.width-page.width*scale)/2},${(size.height-page.height*scale)/2})` } : { width: '100%', height: '100%' }}>
        <div data-preview-artboard className="native-board-preview-frame" style={fit ? { width: page.width, height: page.height } : { width: '100%', height: '100%' }}>
        <div className="native-page-scaled" data-page-id={page.id} style={{ width: page.width, height: page.height, transform: 'none' }} onPointerDown={event => {
          if (!commenting || event.button !== 0 || !event.isPrimary) return
          event.preventDefault()
          const box = event.currentTarget.getBoundingClientRect(), point = { x: (event.clientX - box.left) / scale, y: (event.clientY - box.top) / scale }
          const element = (event.target as Element).closest<HTMLElement>('[data-node-id]'), node = element ? page.nodes[element.dataset.nodeId ?? ''] : undefined
          const at = node ? anchorInFrame(page.id, node.id, readNodeFrame(viewportRef.current, page, node, scale), point) : { x: point.x / page.width, y: point.y / page.height }
          onComment({ pageId: page.id, ...(node ? { nodeId: node.id } : {}), ...at })
        }}>
          <PageContent document={document} page={page} compute={compute} presenting={!commenting} visibleNodeIds={visible[page.id]?.ids ?? new Set()} pageVersion={pageVersion} revisionSeq={revisionSeq} />
          {comments.filter(thread => thread.status === 'open').map((thread, index) => {
            const anchor = decodeCommentAnchor(thread.anchor)
            if (anchor?.pageId !== page.id) return null
            const node = anchor.nodeId ? page.nodes[anchor.nodeId] : undefined
            const point = node ? pointInFrame(anchor, readNodeFrame(viewportRef.current, page, node, scale)) : commentPoint(anchor, page)
            return point && <button type="button" key={thread.id} className="native-comment-pin" aria-label={`评论 ${index + 1}：${thread.label}`} style={{ left: point.x, top: point.y, transform: `scale(${1 / scale})` }} onPointerDown={event => event.stopPropagation()} onClick={() => onComment(anchor, thread.id)}>{index + 1}</button>
          })}
        </div>
        </div>
      </div>}
    </div>
  </section>
}
