import {isFlowChild} from '../../../../shared/artifact-geometry'
import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import {naturalNodeStyle,layoutRevision,isNaturalText} from './natural-layout'
import type { ArtifactDocument, ArtifactPage } from '../../../../shared/artifact-document'
import {readElementFrame,layoutPosition} from './rendered-geometry'
import type { Bounds, NativeCompute } from './compute'
import { elementBounds, expandVisibleNodes } from './visibility'
import type {NaturalNodeSizes} from './natural-layout'

export function useVisibleElements({ pages, revision, viewport, scale, root, compute, pageId, selected, editingId, onError, naturalSource, naturalSizes, naturalDocument, naturalRevision, onNaturalLayout }: {
  naturalRevision?:number;naturalDocument?:ArtifactDocument;naturalSource?:ArtifactPage;naturalSizes?:NaturalNodeSizes;onNaturalLayout?():void
  pages: ArtifactPage[]; revision: number; viewport: { x: number; y: number; width: number; height: number }; scale: number
  root: RefObject<HTMLDivElement | null>; compute: NativeCompute; pageId: string | null; selected: string[]; editingId: string | null; onError(message: string): void
}) {
  const cache = useRef(new Map<string, { page: ArtifactPage; bounds: Bounds[] }>())
  const [visible, setVisible] = useState<Record<string, { page: ArtifactPage; ids: Set<string>; bottom: number }>>({})
  useLayoutEffect(()=>{
    const container=root.current
    if(!container||!naturalSource||!naturalSizes||!onNaturalLayout)return
    const notes=Array.from(container.querySelectorAll<HTMLElement>(`[data-page-id="${naturalSource.id}"] [data-native-natural-height], [data-natural-measure-page="${naturalSource.id}"] [data-native-measure-node]`))
    const measure=()=>{
      let changed=false
      for(const element of notes){
        const node=naturalSource.nodes[element.dataset.nodeId??element.dataset.nativeMeasureNode??'']
        if(!node||!element.getClientRects().length)continue
        const probing=!!element.closest('[data-natural-measure-page]')
        if(!isNaturalText(node)&&!isFlowChild(naturalSource,node))continue
        const style=getComputedStyle(element),width=Number.parseFloat(style.width),height=Number.parseFloat(style.height)
        if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)continue
        let position:{x:number;y:number}|undefined
        if(isFlowChild(naturalSource,node)){
          const surface=element.closest<HTMLElement>('[data-page-id],[data-natural-measure-page]'),parentElement=element.parentElement?.closest<HTMLElement>('[data-node-id],[data-native-layout-node]'),parent=node.parentId?naturalSource.nodes[node.parentId]:undefined
          if(surface&&parentElement&&parent){const zoom=probing?1:scale;position=layoutPosition(node,readElementFrame(surface,element,naturalSource,node,zoom),readElementFrame(surface,parentElement,naturalSource,parent,zoom))}
        }
        const effective=naturalNodeStyle(naturalSource,node,naturalDocument),old=naturalSizes.get(node,effective,layoutRevision(node,naturalDocument))
        if(!old||Math.abs(old.width-width)>.01||Math.abs(old.height-height)>.01||position&&(old.x===undefined||old.y===undefined||Math.abs(old.x-position.x)>.01||Math.abs(old.y-position.y)>.01)){naturalSizes.set(node,{width,height,...position},effective,layoutRevision(node,naturalDocument));changed=true}
      }
      if(changed)onNaturalLayout()
    }
    const observer=new ResizeObserver(measure)
    for(const element of notes)observer.observe(element)
    measure()
    return()=>observer.disconnect()
  },[naturalSource,naturalSizes,naturalDocument,naturalRevision,root,onNaturalLayout,visible,scale])
  useLayoutEffect(() => {
    const controller = new AbortController()
    const container = root.current
    if (!container || !pages.length) { setVisible({}); return }
    const viewportBounds = container.getBoundingClientRect()
    const activeIds = new Set(pages.map(page => page.id))
    for (const id of cache.current.keys()) if (!activeIds.has(id)) { cache.current.delete(id); void compute.dropElements(id, revision).catch(() => {}) }
    void (async () => {
      const next: typeof visible = {}
      // Sequential queries remain correct when more than eight boards are visible:
      // each query finishes before the worker can evict its page's bounded index.
      for (const page of pages) {
        if (controller.signal.aborted) return
        const shell = Array.from(container.querySelectorAll<HTMLElement>('[data-page-id]')).find(element => element.dataset.pageId === page.id)
        if (!shell) continue
        const bounds = shell.getBoundingClientRect()
        const previous = cache.current.get(page.id)
        const rectangles = previous?.page === page ? previous.bounds : elementBounds(page)
        if (previous?.page !== page) {
          await compute.setElements(page.id, rectangles, revision)
          cache.current.set(page.id, { page, bounds: rectangles })
          const issues = await compute.validateNodeBounds(rectangles, revision, controller.signal)
          if (issues.length) onError('部分元素位置无效，请检查元素尺寸。')
        } else {
          try { await compute.updateElements(page.id, [], [], revision) }
          catch (error) { if (controller.signal.aborted || (error as Error).name === 'AbortError') throw error; await compute.setElements(page.id, rectangles, revision) }
        }
        const ids = await compute.visibleElements(page.id, { x: (viewportBounds.left - bounds.left) / scale - 48, y: (viewportBounds.top - bounds.top) / scale - 48, width: viewportBounds.width / scale + 96, height: viewportBounds.height / scale + 96 }, revision, controller.signal)
        next[page.id] = { page, ids: expandVisibleNodes(page, ids, page.id === pageId ? [...selected, ...(editingId ? [editingId] : [])] : []), bottom: Math.max(40, ...rectangles.map(item => item.y + item.height)) }
      }
      if (!controller.signal.aborted) setVisible(next)
    })().catch(error => { if (!controller.signal.aborted && error?.name !== 'AbortError') onError('元素计算暂时不可用，请重新打开文稿。') })
    return () => controller.abort()
  }, [pages, revision, viewport, scale, root, compute, pageId, selected, editingId, onError])
  return visible
}
