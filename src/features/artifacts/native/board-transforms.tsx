import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent,type MouseEvent as ReactMouseEvent,type KeyboardEvent as ReactKeyboardEvent} from 'react'
import type {ArtifactDocument,ArtifactPage} from '../../../../shared/artifact-document'
import type {ArtifactOperation} from '../../../../shared/artifact-operations'
import {duplicatePages} from '../../../../shared/artifact-editor-actions'
import {moveBoardRects,resizeBoardRect,type BoardRect,type BoardHandle,type BoardSnap} from '../../../../shared/artifact-board-transform'

interface Options {
  document:ArtifactDocument|null;ids:string[];selected:string[];nodeSelected:boolean;enabled:boolean;writable:boolean;scale:number
  visibleIds():string[]
  getDocument():ArtifactDocument|null
  ensurePage(id:string):Promise<void>
  select(id:string,multiple?:boolean,range?:boolean):void
  dispatch(operations:ArtifactOperation[],base:ArtifactDocument):void
  notice(message:string):void
}
interface Preview {frames:Record<string,BoardRect>;activeIds:string[];retainedIds:string[];copy:boolean;guides:BoardSnap[]}
type BoardPointer=Pick<PointerEvent,'clientX'|'clientY'|'altKey'|'ctrlKey'|'metaKey'|'shiftKey'>
const pointerState=(event:BoardPointer):BoardPointer=>({clientX:event.clientX,clientY:event.clientY,altKey:event.altKey,ctrlKey:event.ctrlKey,metaKey:event.metaKey,shiftKey:event.shiftKey})
interface Drag {last:BoardPointer;base:ArtifactDocument;ids:string[];pages:ArtifactPage[];others:ArtifactPage[];scale:number;x:number;y:number;pointer:number;target:HTMLElement;handle?:BoardHandle;copy:boolean;moved:boolean;frames:Record<string,BoardRect>;stop():void}
const empty:Preview={frames:{},activeIds:[],retainedIds:[],copy:false,guides:[]}
const handles:BoardHandle[]=['n','e','s','w','nw','ne','se','sw']
const names:Record<BoardHandle,string>={n:'上边',e:'右边',s:'下边',w:'左边',nw:'左上角',ne:'右上角',se:'右下角',sw:'左下角'}

export function useBoardTransforms(options:Options){
  const latest=useRef(options);latest.current=options
  const active=useRef<Drag|null>(null),suppress=useRef(false),finishing=useRef<object|null>(null)
  const [preview,setPreview]=useState<Preview>(empty)
  const cancel=()=>{const drag=active.current;finishing.current=null;suppress.current=false;if(drag){active.current=null;drag.stop()}setPreview(empty)}
  useEffect(()=>()=>{const drag=active.current;active.current=null;finishing.current=null;drag?.stop()},[])
  useEffect(()=>{if(!options.enabled||!options.writable||active.current&&(options.document?.id!==active.current.base.id||active.current.ids.some(id=>!options.document?.pages[id]||!options.ids.includes(id))))cancel()},[options.enabled,options.writable,options.document,options.ids])
  const calculate=(drag:Drag,event:BoardPointer)=>{
    const dx=(event.clientX-drag.x)/drag.scale,dy=(event.clientY-drag.y)/drag.scale,targets=event.ctrlKey||event.metaKey?[]:drag.copy?[...drag.others,...drag.pages]:drag.others
    const result=drag.handle?(()=>{const value=resizeBoardRect(drag.pages[0],drag.handle!,dx,dy,targets,drag.scale,event.shiftKey);return{rects:[value.rect],guides:value.guides}})():moveBoardRects(drag.pages,dx,dy,targets,drag.scale,drag.copy)
    return{frames:Object.fromEntries(drag.ids.map((id,index)=>[id,result.rects[index]])),guides:result.guides}
  }
  const start=(event:ReactPointerEvent<HTMLElement>,pageId:string,handle?:BoardHandle)=>{
    const opts=latest.current
    if(!opts.enabled||event.button!==0||!event.isPrimary)return
    if(!handle&&(event.target as Element).closest('.native-board-heading-actions'))return
    event.preventDefault();event.stopPropagation()
    const focusTarget=handle?event.currentTarget:event.currentTarget.querySelector<HTMLElement>('.native-board-label');focusTarget?.focus({preventScroll:true})
    if(active.current)cancel()
    const base=opts.getDocument(),page=base?.pages[pageId];if(!base||!page)return
    const selected=!opts.nodeSelected&&opts.selected.includes(pageId)?opts.selected.filter(id=>opts.ids.includes(id)):[pageId]
    const deferredSelection=!handle&&!opts.nodeSelected&&opts.selected.includes(pageId)
    if(!opts.selected.includes(pageId)||opts.nodeSelected)opts.select(pageId,event.shiftKey,false)
    if(!opts.writable){suppress.current=true;if(deferredSelection)opts.select(pageId,event.shiftKey,false);return}
    finishing.current=null;suppress.current=true
    const ids=handle?[pageId]:selected,pages=ids.map(id=>base.pages[id]),target=event.currentTarget,editor=target.closest<HTMLElement>('[data-native-artifact-editor]')
    const drag:Drag={last:pointerState(event),base,ids,pages,others:opts.ids.filter(id=>!ids.includes(id)).map(id=>base.pages[id]),scale:opts.scale,x:event.clientX,y:event.clientY,pointer:event.pointerId,target,handle,copy:!handle&&event.altKey,moved:false,frames:{},stop:()=>{}}
    const show=(position:BoardPointer)=>{
      drag.copy=!drag.handle&&position.altKey
      const result=calculate(drag,position);drag.frames=result.frames
      setPreview(previous=>({...previous,frames:result.frames,guides:result.guides,copy:drag.copy}))
    }
    const move=(event:PointerEvent)=>{
      if(active.current!==drag||event.pointerId!==drag.pointer)return
      event.preventDefault();event.stopPropagation();drag.last=pointerState(event)
      if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>3)drag.moved=true
      if(drag.moved)show(drag.last)
    }
    const finish=async(event:PointerEvent)=>{
      if(active.current!==drag||event.pointerId!==drag.pointer)return
      event.preventDefault();event.stopPropagation();active.current=null;drag.stop();setTimeout(()=>{suppress.current=false},0)
      if(!drag.moved||!latest.current.writable){if(!drag.moved&&deferredSelection)latest.current.select(pageId,event.shiftKey,false);setPreview(empty);return}
      drag.copy=!drag.handle&&event.altKey;drag.frames=calculate(drag,event).frames
      const token={};finishing.current=token
      try{
        if(drag.copy){
          for(const id of drag.ids)await latest.current.ensurePage(id)
          if(finishing.current!==token||!latest.current.writable)return
          const source=latest.current.getDocument();if(!source)return
          const ordered=source.pageOrder.filter(id=>drag.ids.includes(id)),operations=duplicatePages(source,ordered,()=>crypto.randomUUID()),insertions=operations.filter((value):value is Extract<ArtifactOperation,{type:'page.insert'}>=>value.type==='page.insert')
          for(const [index,insertion]of insertions.entries()){const frame=drag.frames[ordered[index]];insertion.index=source.pageOrder.length+index;if(frame)Object.assign(insertion.page,frame)}
          latest.current.dispatch(operations,source);if(insertions[0])latest.current.select(insertions[0].page.id);editor?.focus({preventScroll:true})
        }else{
          const operations:ArtifactOperation[]=drag.ids.flatMap(id=>{
            const frame=drag.frames[id],before=drag.base.pages[id];if(!frame)return[]
            const patch=Object.fromEntries((['x','y','width','height'] as const).filter(key=>frame[key]!==before[key]).map(key=>[key,frame[key]]))
            return Object.keys(patch).length?[{type:'page.patch' as const,pageId:id,patch}]:[]
          })
          if(operations.length)latest.current.dispatch(operations,drag.base)
        }
      }catch{latest.current.notice('画板修改未能保存，请重试。')}
      finally{if(finishing.current===token){finishing.current=null;setPreview(empty)}}
    }
    const key=(event:KeyboardEvent)=>{
      if(active.current!==drag)return
      if(event.key==='Escape'&&!event.isComposing){event.preventDefault();event.stopPropagation();cancel();return}
      if(['Alt','Shift','Control','Meta'].includes(event.key)){
        event.preventDefault();drag.last={...drag.last,altKey:event.altKey,ctrlKey:event.ctrlKey,metaKey:event.metaKey,shiftKey:event.shiftKey}
        if(drag.moved)show(drag.last)
      }
    }
    const lost=()=>cancel()
    drag.stop=()=>{window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',finish,true);window.removeEventListener('pointercancel',lost,true);window.removeEventListener('keydown',key,true);window.removeEventListener('keyup',key,true);window.removeEventListener('blur',lost);if(target.hasPointerCapture(drag.pointer))target.releasePointerCapture(drag.pointer)}
    active.current=drag;target.setPointerCapture(drag.pointer)
    window.addEventListener('pointermove',move,true);window.addEventListener('pointerup',finish,true);window.addEventListener('pointercancel',lost,true);window.addEventListener('keydown',key,true);window.addEventListener('keyup',key,true);window.addEventListener('blur',lost)
    setPreview({frames:{},activeIds:ids,retainedIds:opts.visibleIds(),copy:drag.copy,guides:[]})
  }
  const key=(event:ReactKeyboardEvent,pageId:string,handle?:BoardHandle)=>{
    const opts=latest.current,base=opts.getDocument(),page=base?.pages[pageId]
    if(!opts.enabled||!opts.writable||!base||!page||event.ctrlKey||event.metaKey||event.altKey||event.nativeEvent.isComposing||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return
    event.preventDefault();event.stopPropagation()
    const step=event.shiftKey?10:1,dx=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,dy=event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0
    const ids=handle?[pageId]:opts.selected.includes(pageId)?opts.selected.filter(id=>opts.ids.includes(id)):[pageId]
    const operations:ArtifactOperation[]=ids.flatMap(id=>{
      const item=base.pages[id];if(!item)return[]
      const frame=handle?resizeBoardRect(item,handle,dx,dy,[],1).rect:{...item,x:item.x+dx,y:item.y+dy}
      const patch=Object.fromEntries((['x','y','width','height'] as const).filter(field=>frame[field]!==item[field]).map(field=>[field,frame[field]]))
      return Object.keys(patch).length?[{type:'page.patch' as const,pageId:id,patch}]:[]
    })
    if(operations.length)opts.dispatch(operations,base)
  }
  const click=(event:ReactMouseEvent)=>{if(suppress.current&&event.detail>0){event.preventDefault();event.stopPropagation();suppress.current=false}}
  return{preview,start,click,key,cancel}
}

export function BoardTransformHandles({page,start,onKey}:{page:ArtifactPage;onKey(event:ReactKeyboardEvent,pageId:string,handle:BoardHandle):void;start(event:ReactPointerEvent<HTMLElement>,pageId:string,handle:BoardHandle):void}){
  return <div className="native-board-selection" data-board-selection={page.id}>{handles.map(handle=><button type="button" key={handle} className={`native-board-resize native-board-resize-${handle}`} aria-label={`调整画板${names[handle]} ${page.title}`} data-board-handle={handle} onKeyDown={event=>onKey(event,page.id,handle)} onPointerDown={event=>start(event,page.id,handle)}>{handle.length===2&&<span/>}</button>)}</div>
}
