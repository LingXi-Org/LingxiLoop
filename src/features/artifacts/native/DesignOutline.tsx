import {useEffect,useMemo,useRef,useState,type KeyboardEvent} from 'react'
import type {ArtifactDocument} from '../../../../shared/artifact-document'
import type {ArtifactOperation} from '../../../../shared/artifact-operations'
import {EditorIcon,IconButton,type EditorIconName} from './EditorPrimitives'
import {nodeTypeLabels} from './editor-copy'
import {outlineRows,outlineNodeSummary,type OutlineRow} from './outline-rows'

interface Props {
  document:ArtifactDocument;pageIds:string[];currentId?:string;selected:string[];selectedPages:string[];loadedPageIds:string[]
  sheet:boolean;height:number;setHeight(value:number):void;writable:boolean
  selectPage(id:string,multiple:boolean,range:boolean):void
  selectNodes(pageId:string,ids:string[]):void
  openContext(pageId:string,nodeId:string|undefined,point:{x:number;y:number},opener:HTMLElement):void
  ensurePage(id:string):Promise<void>
  dispatch(operations:ArtifactOperation[],base:ArtifactDocument):void
}
const rowHeight=24
const icons:Record<string,EditorIconName>={text:'text',group:'frame',image:'image',video:'play',shape:'square',line:'line',drawing:'pen',svg:'shapes',table:'table',math:'text',embed:'frame',note:'note'}

export default function DesignOutline(props:Props){
  const {document,pageIds,currentId,selected,sheet,height}=props
  const tree=useRef<HTMLDivElement>(null),anchor=useRef<string|null>(null),drag=useRef<{y:number;height:number}|null>(null)
  const [expanded,setExpanded]=useState(()=>new Set(currentId?[`page:${currentId}`]:[]))
  const [focused,setFocused]=useState(currentId?`page:${currentId}`:'')
  const [scroll,setScroll]=useState(0),[viewportHeight,setViewportHeight]=useState(height)
  const [loading,setLoading]=useState(new Set<string>()),[failed,setFailed]=useState(new Set<string>())
  const loaded=useMemo(()=>new Set(props.loadedPageIds),[props.loadedPageIds])
  const rows=useMemo(()=>outlineRows(document,pageIds,expanded,loaded),[document,pageIds,expanded,loaded])
  const summary=(row:OutlineRow)=>row.node?outlineNodeSummary(document,row.pageId,row.node):undefined
  const label=(row:OutlineRow)=>row.kind==='page'?document.pages[row.pageId].title:summary(row)||nodeTypeLabels[row.node!.type]
  const load=async(pageId:string)=>{
    setLoading(old=>new Set(old).add(pageId));setFailed(old=>{const next=new Set(old);next.delete(pageId);return next})
    try{await props.ensurePage(pageId)}catch{setFailed(old=>new Set(old).add(pageId))}
    finally{setLoading(old=>{const next=new Set(old);next.delete(pageId);return next})}
  }
  const reveal=(key:string,focus=false)=>{
    const index=rows.findIndex(row=>row.key===key),element=tree.current
    if(index<0||!element)return
    const top=index*rowHeight+6,bottom=top+rowHeight
    const next=top<element.scrollTop?Math.max(0,top-6):bottom>element.scrollTop+element.clientHeight?bottom-element.clientHeight:element.scrollTop
    element.scrollTop=next;setScroll(next)
    if(focus)requestAnimationFrame(()=>{const target=tree.current?.querySelector<HTMLElement>(`[data-outline-index="${index}"]`);target?.focus({preventScroll:true})})
  }
  useEffect(()=>{
    if(!currentId)return
    const page=document.pages[currentId],node=selected[0]?page?.nodes[selected[0]]:undefined
    setExpanded(old=>{
      const next=new Set(old);next.add(`page:${currentId}`)
      let parent=node?.parentId
      while(parent){next.add(`node:${currentId}:${parent}`);parent=page.nodes[parent]?.parentId}
      return next
    })
    setFocused(node?`node:${currentId}:${node.id}`:`page:${currentId}`)
  },[currentId,selected.join('|')])
  useEffect(()=>{
    const element=tree.current;if(!element)return
    const observer=new ResizeObserver(()=>setViewportHeight(element.clientHeight));observer.observe(element)
    return()=>observer.disconnect()
  },[])
  useEffect(()=>{reveal(focused)},[focused,rows])
  const toggle=(row:OutlineRow)=>{
    if(!row.expandable)return
    setExpanded(old=>{const next=new Set(old);if(next.has(row.key))next.delete(row.key);else next.add(row.key);return next})
    if(!row.expanded&&row.kind==='page'&&!loaded.has(row.pageId))void load(row.pageId)
    setFocused(row.key)
  }
  const select=(row:OutlineRow,multiple=false,range=false)=>{
    if(row.kind==='pending')return
    if(row.kind==='page')props.selectPage(row.pageId,multiple,range)
    else{
      const previous=currentId===row.pageId?selected:[]
      let ids=multiple?(previous.includes(row.node!.id)?previous.filter(id=>id!==row.node!.id):[...previous,row.node!.id]):[row.node!.id]
      const start=rows.findIndex(value=>value.key===anchor.current),end=rows.indexOf(row)
      if(range&&start>=0&&rows[start].pageId===row.pageId)ids=rows.slice(Math.min(start,end),Math.max(start,end)+1).flatMap(value=>value.node?[value.node.id]:[])
      props.selectNodes(row.pageId,ids)
    }
    if(!range)anchor.current=row.key
    setFocused(row.key)
  }
  const navigate=(event:KeyboardEvent<HTMLDivElement>,row:OutlineRow)=>{
    if(event.target!==event.currentTarget)return
    if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){event.preventDefault();event.stopPropagation();const rect=event.currentTarget.getBoundingClientRect();props.openContext(row.pageId,row.node?.id,{x:rect.right-24,y:rect.y+12},event.currentTarget);return}
    if(!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End',' '].includes(event.key))return
    event.preventDefault();event.stopPropagation()
    const selectable=rows.filter(value=>value.kind!=='pending'),index=selectable.indexOf(row)
    let target:OutlineRow|undefined
    if(event.key==='ArrowDown')target=selectable[Math.min(selectable.length-1,index+1)]
    if(event.key==='ArrowUp')target=selectable[Math.max(0,index-1)]
    if(event.key==='Home')target=selectable[0]
    if(event.key==='End')target=selectable.at(-1)
    if(event.key==='ArrowRight'){if(row.expandable&&!row.expanded)toggle(row);else if(selectable[index+1]?.parentKey===row.key)target=selectable[index+1]}
    if(event.key==='ArrowLeft'){if(row.expanded)toggle(row);else target=selectable.find(value=>value.key===row.parentKey)}
    if(event.key===' ')select(row,event.ctrlKey||event.metaKey,event.shiftKey)
    if(target){select(target,event.ctrlKey||event.metaKey,event.shiftKey);setFocused(target.key);reveal(target.key,true)}
  }
  const start=Math.max(0,Math.floor(scroll/rowHeight)-4),visible=rows.slice(start,start+Math.ceil(viewportHeight/rowHeight)+9)
  return <div className="native-outline" data-sheet={sheet} style={sheet?undefined:{height:height+1}}>
    <div ref={tree} role="tree" aria-label="图层" aria-multiselectable="true" className="native-outline-tree" style={sheet?undefined:{height}} onScroll={event=>setScroll(event.currentTarget.scrollTop)}>
      <div className="native-outline-space" style={{height:rows.length*rowHeight}}>
        {visible.map((row,offset)=>row.kind==='pending'?<div className="native-outline-row native-outline-pending" style={{top:(start+offset)*rowHeight}} key={row.key} role="status" onContextMenu={event=>{event.preventDefault();event.stopPropagation()}}>{failed.has(row.pageId)?<button type="button" onClick={()=>void load(row.pageId)}>重试加载图层</button>:loading.has(row.pageId)?'正在加载图层…':<button type="button" onClick={()=>void load(row.pageId)}>加载图层</button>}</div>:<div key={row.key} data-outline-index={start+offset} role="treeitem" data-outline-node={row.node?.id} aria-label={row.node?`${nodeTypeLabels[row.node.type]}，${label(row)}`:label(row)} aria-level={row.level} aria-posinset={row.position} aria-setsize={row.size} aria-expanded={row.expandable?row.expanded:undefined} aria-selected={row.node?row.pageId===currentId&&selected.includes(row.node.id):!selected.length&&props.selectedPages.includes(row.pageId)} aria-current={row.kind==='page'&&row.pageId===currentId?true:undefined} tabIndex={row.key===focused?0:-1} className="native-outline-row" data-outline-kind={row.kind} data-hidden={row.node?.hidden||undefined} style={{top:(start+offset)*rowHeight,paddingInlineStart:6+(row.level-1)*16}} onFocus={()=>setFocused(row.key)} onClick={event=>{select(row,event.ctrlKey||event.metaKey,event.shiftKey);event.currentTarget.focus({preventScroll:true})}} onKeyDown={event=>navigate(event,row)} onContextMenu={event=>{event.preventDefault();event.stopPropagation();props.openContext(row.pageId,row.node?.id,{x:event.clientX,y:event.clientY},event.currentTarget)}} onDoubleClick={()=>{if(row.expandable)toggle(row)}}>
          {row.expandable?<button type="button" className="native-outline-toggle" tabIndex={-1} aria-label={`${row.expanded?'收起':'展开'}${row.kind==='page'?'画板':'组合'} ${label(row)}`} aria-expanded={row.expanded} onPointerDown={event=>event.preventDefault()} onClick={event=>{event.stopPropagation();toggle(row)}}><EditorIcon name="chevron" size={12}/></button>:<span className="native-outline-toggle"/>}
          <EditorIcon name={row.kind==='page'?'frame':icons[row.node!.type]} size={16}/><span className="native-outline-label">{row.node&&summary(row)?<><span className="native-outline-kind">{nodeTypeLabels[row.node.type]}</span><span className="native-outline-name">“{label(row)}”</span></>:label(row)}</span>
          {row.node&&props.writable&&<span className="native-outline-actions"><IconButton tabIndex={row.key===focused?0:-1} icon="eye" label={`${row.node.hidden?'显示':'隐藏'}图层 ${label(row)}`} disabled={!props.writable} onClick={event=>{event.stopPropagation();props.dispatch([{type:'node.patch',pageId:row.pageId,nodeId:row.node!.id,patch:{hidden:!row.node!.hidden}}],document)}}/></span>}
        </div>)}
      </div>
    </div>
    {!sheet&&<div role="separator" aria-label="调整图层列表高度" aria-orientation="horizontal" aria-valuemin={72} aria-valuemax={480} aria-valuenow={height} tabIndex={0} className="native-outline-resize" onPointerDown={event=>{event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);drag.current={y:event.clientY,height}}} onPointerMove={event=>{if(drag.current)props.setHeight(Math.max(72,Math.min(480,drag.current.height+event.clientY-drag.current.y)))}} onPointerUp={event=>{drag.current=null;event.currentTarget.releasePointerCapture(event.pointerId)}} onPointerCancel={()=>{drag.current=null}} onKeyDown={event=>{if(event.key!=='ArrowDown'&&event.key!=='ArrowUp')return;event.preventDefault();event.stopPropagation();props.setHeight(Math.max(72,Math.min(480,height+(event.key==='ArrowDown'?1:-1)*(event.shiftKey?32:8))))}}/>}
  </div>
}
