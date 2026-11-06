import {forwardRef,useEffect,useLayoutEffect,useImperativeHandle,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react'
import {appendVectorPoint,canvasVectorGeometry,canCloseVectorDraft,constrainVectorAngle,vectorDraftPath,type VectorDraftPoint} from '../../../../shared/artifact-vector'
import type {PenGeometry,PenPoint} from '../../../../shared/artifact-pen'
import {useLocalDraft} from './draft-context'
import type {VectorDraftStore,VectorStart} from './vector-drafts'
export type {VectorStart} from './vector-drafts'

interface Key {key:string;shiftKey:boolean;ctrlKey:boolean;metaKey:boolean;preventDefault():void;stopPropagation():void}
export interface CanvasPenHandle {down(event:ReactPointerEvent):void;move(event:ReactPointerEvent):void;up(event:ReactPointerEvent,cancel?:boolean):void;key(event:Key):boolean;discard():void}
export interface CanvasPenProps {
  scale:number;offsetX:number;offsetY:number;writable:boolean
  drafts:VectorDraftStore;canvasPageId:string
  toWorld(event:{clientX:number;clientY:number}):PenPoint
  begin():VectorStart|undefined
  commit(geometry:PenGeometry,start:VectorStart):boolean
  done():void
  announce(message:string):void
  error(message:string):void
  focus():void
}

/** Point drafts are transient; a completed path enters the shared operation chain once. */
const CanvasPenTool=forwardRef<CanvasPenHandle,CanvasPenProps>(function CanvasPenTool(props,ref){
  const restored=props.drafts.get(props.canvasPageId)
  const points=useRef<VectorDraftPoint[]>(restored?.points??[]),start=useRef<VectorStart|null>(restored?.start??null),pointer=useRef<{id:number;x:number;y:number;kind:'append'|'close'}|null>(null)
  const [draft,setDraft]=useState<VectorDraftPoint[]>(restored?.points??[]),[hover,setHover]=useState<PenPoint|null>(null),hoverRaw=useRef<PenPoint|null>(null)
  const latest=useRef(props);latest.current=props
  const mounted=useRef(false)
  useLayoutEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
  useLocalDraft(reason=>{if(reason==='unmount'){queueMicrotask(()=>{if(!mounted.current)finish(false)})}else if(reason!=='save')finish(false)})
  function update(next:VectorDraftPoint[]){points.current=next;setDraft(next);if(next.length&&start.current)props.drafts.set(props.canvasPageId,{points:next,start:start.current});else props.drafts.delete(props.canvasPageId)}
  function clear(){pointer.current=null;start.current=null;hoverRaw.current=null;setHover(null);update([])}
  function finish(explicit:boolean,closed=false){
    if(points.current.length>=2&&start.current){
      if(!latest.current.writable){props.drafts.block(props.canvasPageId);return false}
      const geometry=canvasVectorGeometry(points.current,closed)
      if(!geometry){latest.current.error('路径过大，无法保留。请画小一些，或分段绘制。');clear();if(explicit)latest.current.done();return true}
      if(!latest.current.commit(geometry,start.current)){props.drafts.block(props.canvasPageId);return false}
      latest.current.announce(closed?'已完成闭合路径。':'已完成开放路径。')
    }
    clear();if(explicit)latest.current.done();return true
  }
  useEffect(()=>{
    const shift=(event:KeyboardEvent)=>{if(event.key!=='Shift'||!hoverRaw.current)return;const previous=points.current.at(-1);setHover(event.type==='keydown'&&previous?constrainVectorAngle(previous,hoverRaw.current):hoverRaw.current)}
    window.addEventListener('keydown',shift);window.addEventListener('keyup',shift)
    return()=>{window.removeEventListener('keydown',shift);window.removeEventListener('keyup',shift)}
  },[])
  useImperativeHandle(ref,()=>({
    discard:clear,
    down(event){
      event.preventDefault();event.stopPropagation();if(!props.writable||event.button!==0)return
      props.focus();const raw=props.toWorld(event),old=points.current,point=event.shiftKey&&old.length?constrainVectorAngle(old.at(-1)!,raw):raw
      const radius=event.pointerType==='touch'?20:10
      if(canCloseVectorDraft(old)&&Math.hypot(old[0].x-point.x,old[0].y-point.y)*props.scale<=radius)pointer.current={id:event.pointerId,x:event.clientX,y:event.clientY,kind:'close'}
      else{
        const next=appendVectorPoint(old,raw,props.scale,event.shiftKey);if(next===old)return
        if(!old.length){const value=props.begin();if(!value)return;start.current=value}
        update(next);setHover(point);pointer.current={id:event.pointerId,x:event.clientX,y:event.clientY,kind:'append'}
      }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    move(event){
      event.stopPropagation()
      if(!props.writable)return
      const raw=props.toWorld(event),active=pointer.current,last=points.current.at(-1)
      if(active?.id===event.pointerId&&active.kind==='append'&&event.buttons&&last){
        if(Math.hypot(event.clientX-active.x,event.clientY-active.y)<4&&!last.out)return
        update([...points.current.slice(0,-1),{...last,out:event.shiftKey?constrainVectorAngle(last,raw):raw}]);setHover(null);return
      }
      if(!event.buttons){hoverRaw.current=raw;setHover(event.shiftKey&&last?constrainVectorAngle(last,raw):raw)}
    },
    up(event,cancel=false){
      event.stopPropagation();const active=pointer.current;if(!active||active.id!==event.pointerId)return;pointer.current=null
      if(cancel){if(active.kind==='append')update(points.current.slice(0,-1));return}
      if(active.kind==='close'&&points.current[0]){const point=props.toWorld(event),last=points.current.at(-1)!,end=event.shiftKey?constrainVectorAngle(last,point):point;if(Math.hypot(points.current[0].x-end.x,points.current[0].y-end.y)*props.scale<=(event.pointerType==='touch'?20:10))finish(true,true)}
    },
    key(event){
      const commandUndo=(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'
      if(commandUndo&&points.current.length){event.preventDefault();event.stopPropagation();if(!event.shiftKey){pointer.current=null;update(points.current.slice(0,-1));setHover(hoverRaw.current)}return true}
      if(event.ctrlKey||event.metaKey)return false
      if(event.key==='Enter'||event.key==='Escape'){event.preventDefault();event.stopPropagation();if(event.key==='Escape'&&!props.writable){clear();props.done()}else if(points.current.length>=2)finish(true);else if(event.key==='Escape'){clear();props.done()}return true}
      if(event.key==='Backspace'||event.key==='Delete'){event.preventDefault();event.stopPropagation();pointer.current=null;update(points.current.slice(0,-1));setHover(hoverRaw.current);return true}
      return false
    },
  }))
  const screen=(point:PenPoint)=>({x:props.offsetX+point.x*props.scale,y:props.offsetY+point.y*props.scale}),first=draft[0],last=draft.at(-1)
  const hitRadius=window.matchMedia('(pointer:coarse)').matches?20:10,handleRadius=Math.max(3.5,hitRadius*.45),pointSize=2*handleRadius-2
  const distance=first&&hover?Math.hypot(first.x-hover.x,first.y-hover.y)*props.scale:0,closing=!!hover&&distance<=10&&canCloseVectorDraft(draft)
  const preview=vectorDraftPath(hover&&!closing?[...draft,hover]:draft,closing),accent='var(--native-vector-accent,#257de0)',surface='var(--native-panel,#fff)'
  const handles=last?.out?[{x:2*last.x-last.out.x,y:2*last.y-last.out.y},last.out].map(screen):[]
  return <><svg data-native-vector-tool aria-hidden="true" style={{position:'absolute',inset:0,width:'100%',height:'100%',overflow:'visible',pointerEvents:'none',zIndex:1001}}>
    {preview&&<path data-part="draft" d={preview} transform={`translate(${props.offsetX} ${props.offsetY}) scale(${props.scale})`} fill="none" stroke={accent} strokeWidth={1} vectorEffect="non-scaling-stroke" />}
    {handles.length===2&&<><line x1={handles[0].x} y1={handles[0].y} x2={handles[1].x} y2={handles[1].y} stroke={surface} strokeWidth={3} /><line x1={handles[0].x} y1={handles[0].y} x2={handles[1].x} y2={handles[1].y} stroke={accent} />{handles.map((point,index)=><circle key={index} cx={point.x} cy={point.y} r={handleRadius-.5} fill={surface} stroke={accent} strokeWidth={1.25} />)}</>}
    {first&&distance<=30&&canCloseVectorDraft(draft)&&<circle cx={screen(first).x} cy={screen(first).y} r={10} fill="none" stroke={accent} />}
    {draft.map((point,index)=>{const at=screen(point);return <rect key={index} x={at.x-pointSize/2} y={at.y-pointSize/2} width={pointSize} height={pointSize} fill={accent} />})}
  </svg><span className="native-visually-hidden" role="status">{draft.length?`已添加 ${draft.length} 个控制点。按回车完成路径，按退格撤回最后一点。`:''}</span></>
})
export default CanvasPenTool
