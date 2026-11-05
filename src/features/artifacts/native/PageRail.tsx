import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ArtifactDocument } from '../../../../shared/artifact-document'
import { PageThumbnail } from './thumbnail'
import { Menu, MenuItem } from './EditorPrimitives'

export function PageRail({ document, loadedPageIds, previews, current, selected, grid, writable, onSelect, onOpen, onReorder, onAction, onVisible }: {
  document: ArtifactDocument; loadedPageIds: string[]; current: string | null; selected: string[]; grid?: boolean; writable: boolean
  previews?: Record<string, import('../../../../shared/artifact-document').ArtifactPage>
  onSelect(id: string, multiple: boolean, range: boolean): void; onOpen(id: string): void
  onReorder(ids: string[]): void; onAction(action: 'duplicate' | 'delete' | 'skip' | 'section' | 'up' | 'down', pageId: string): void; onVisible(ids: string[]): void
}) {
  const root = useRef<HTMLDivElement>(null)
  const keyboardFocus=useRef<string|null>(null)
  const [size, setSize] = useState({ width: 800, height: 100 }), [scroll, setScroll] = useState({ x: 0, y: 0 })
  useEffect(() => {
    const element = root.current; if (!element) return
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(element); return () => observer.disconnect()
  }, [])
  const columns = grid ? Math.max(1, Math.floor(size.width / 240)) : document.pageOrder.length
  const step = grid ? size.width / columns : 136, rowHeight = grid ? step * .5625 + 40 : 93.75
  const first = grid ? Math.max(0, Math.floor(scroll.y / rowHeight) - 1) * columns : Math.max(0, Math.floor(scroll.x / step) - 2)
  const end = Math.min(document.pageOrder.length, grid ? (Math.ceil((scroll.y + size.height) / rowHeight) + 1) * columns : Math.ceil((scroll.x + size.width) / step) + 2)
  const visibleCallback = useRef(onVisible); visibleCallback.current = onVisible
  const key = document.pageOrder.slice(first, end).join(',')
  useEffect(() => { visibleCallback.current(key ? key.split(',') : []) }, [key])
  useLayoutEffect(()=>{
    if(!keyboardFocus.current)return
    const button=Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[data-page-target]')??[]).find(e=>e.dataset.pageTarget===keyboardFocus.current)
    if(button){button.focus({preventScroll:true});keyboardFocus.current=null}
  },[current,first,end])
  useEffect(() => {
    if (!current || !root.current) return
    const index=document.pageOrder.indexOf(current),element=root.current
    if(grid){const at=Math.floor(index/columns)*rowHeight;if(at<element.scrollTop||at+rowHeight>element.scrollTop+element.clientHeight)element.scrollTo({top:Math.max(0,at-(element.clientHeight-rowHeight)/2),behavior:'instant'});return}
    const at = index * 136
    if (at < element.scrollLeft || at + 136 > element.scrollLeft + element.clientWidth) element.scrollTo({ left: Math.max(0, at - element.clientWidth / 2 + 68), behavior: 'instant' })
  }, [current, grid, document.pageOrder,columns,rowHeight,size.width,size.height])
  return <nav className={grid ? 'native-page-grid' : 'native-pages'} aria-label={document.kind === 'slides' ? '页面导航' : '画板导航'}>
    <div ref={root} className="native-page-list" aria-orientation={grid ? 'vertical' : 'horizontal'} onScroll={e => setScroll({ x: e.currentTarget.scrollLeft, y: e.currentTarget.scrollTop })} onKeyDown={event=>{
      const target=(event.target as HTMLElement).closest<HTMLElement>('[data-page-target]');if(!target)return
      const index=document.pageOrder.indexOf(target.dataset.pageTarget!),delta=event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:event.key==='ArrowDown'?grid?columns:1:event.key==='ArrowUp'?grid?-columns:-1:0
      if(!delta&&event.key!=='Home'&&event.key!=='End')return
      event.preventDefault();event.stopPropagation()
      const next=event.key==='Home'?0:event.key==='End'?document.pageOrder.length-1:Math.max(0,Math.min(document.pageOrder.length-1,index+delta)),id=document.pageOrder[next]
      if(id){keyboardFocus.current=id;onSelect(id,false,event.shiftKey)}
    }}>
      <div className="native-rail-space" style={{ width: grid ? '100%' : document.pageOrder.length * step+24, height: grid ? Math.ceil(document.pageOrder.length / columns) * rowHeight : rowHeight }}>
        {document.pageOrder.slice(first, end).map((pageId, offset) => {
          const index = first + offset, page = document.pages[pageId]!
          return <div className="native-page-item" key={pageId} style={{ left: grid ? index % columns * step : 12+index * step, top: grid ? Math.floor(index / columns) * rowHeight : 0, width: step, height: rowHeight }}>
            <button type="button" data-page-target={pageId} tabIndex={current===pageId?0:-1} aria-current={current === pageId ? 'page' : undefined} aria-pressed={selected.includes(pageId)} aria-label={`${index + 1}：${page.title}${page.skip ? '，已跳过' : ''}`} className="native-page-button" onClick={e => onSelect(pageId, e.metaKey || e.ctrlKey, e.shiftKey)} onDoubleClick={() => onOpen(pageId)} draggable={writable}
              onDragStart={e => e.dataTransfer.setData('application/lingxi-page', pageId)} onDragOver={e => { if (writable) e.preventDefault() }} onDrop={e => { if (!writable) return; e.preventDefault(); const id = e.dataTransfer.getData('application/lingxi-page'); if (!document.pages[id] || id === pageId) return; const next = document.pageOrder.filter(value => value !== id); next.splice(next.indexOf(pageId), 0, id); onReorder(next) }}>
              <span className={`native-page-preview ${page.skip ? 'native-page-skipped' : ''}`}><PageThumbnail page={loadedPageIds.includes(pageId) ? page : previews?.[pageId] ?? page} document={document} loaded={loadedPageIds.includes(pageId) || !!previews?.[pageId]} /><span className="native-page-number">{index + 1}</span></span>
              {grid && <span className="native-page-title">{page.title}</span>}
            </button>
            {writable && <div className="native-page-actions"><Menu label={`页面 ${index + 1} 操作`} icon="more" align="end"><MenuItem icon="copy" onClick={() => onAction('duplicate', pageId)}>复制页面</MenuItem><MenuItem selected={page.skip} onClick={() => onAction('skip', pageId)}>{page.skip ? '取消跳过' : '跳过页面'}</MenuItem><MenuItem onClick={() => onAction('section', pageId)}>添加节</MenuItem><MenuItem icon="up" disabled={index===0} onClick={()=>onAction('up',pageId)}>页面上移</MenuItem><MenuItem icon="down" disabled={index===document.pageOrder.length-1} onClick={()=>onAction('down',pageId)}>页面下移</MenuItem><MenuItem icon="delete" onClick={() => onAction('delete', pageId)}>删除页面</MenuItem></Menu></div>}
            {page.section && <span className="native-page-section">{page.section}</span>}
          </div>
        })}
      </div>
    </div>
  </nav>
}
