import {forwardRef,useEffect,useImperativeHandle,useLayoutEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react'
import type {ArtifactNode} from '../../../../shared/artifact-document'
import {constrainVectorAngle} from '../../../../shared/artifact-vector'
import {breakVectorTangent,deleteVectorPoint,mapEditableVector,moveVectorPart,nearestVectorSegment,parseEditableVector,pullVectorHandles,splitVectorSegment,toggleVectorSmooth,vectorControlVisible,vectorPartPoint,vectorSvgPath,vectorTabParts,type EditableVector,type VectorPart} from '../../../../shared/artifact-vector-edit'
import type {PenPoint} from '../../../../shared/artifact-pen'
import {useLocalDraft} from './draft-context'
import {vectorNodePatch,vectorReadKeys,vectorNodeInset,type VectorNodePatch} from './vector-node-geometry'
import type {VectorEditBase,VectorEditDraft,VectorEditDraftStore} from './vector-edit-drafts'

interface Key {key:string;shiftKey:boolean;ctrlKey:boolean;metaKey:boolean;altKey:boolean;preventDefault():void;stopPropagation():void}
export interface PointView {scale:number;offsetX:number;offsetY:number;toWorld(event:{clientX:number;clientY:number}):PenPoint}
export interface CanvasPointHandle {key(event:Key):boolean;discard():void;isDragging():boolean}
interface Props {
  node:ArtifactNode;pageId:string;writable:boolean;drafts:VectorEditDraftStore
  view():PointView
  capture():VectorEditBase|undefined
  isWritable():boolean
  isPanning():boolean
  pan(event:ReactPointerEvent):void
  commit(patch:VectorNodePatch,base:VectorEditBase,readKeys:readonly string[]):boolean
  done():void
  focus():void
  announce(message:string):void
  error(message:string):void
}
interface Gesture {before:EditableVector;base:VectorEditBase;prior?:VectorEditDraft;kind:'pointer'|'keyboard';selection:VectorPart;mode:'move'|'pull'|'break'|'insert';pointerId?:number;screen?:PenPoint;model?:PenPoint;offset?:PenPoint;moved:boolean;pathBase:EditableVector}
const samePart=(a:VectorPart|undefined,b:VectorPart|undefined)=>!!a&&!!b&&a.contour===b.contour&&a.anchor===b.anchor&&a.part===b.part
const arrows:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}
function parsed(node:ArtifactNode,base:VectorEditBase,scale:number):EditableVector {
  const inset=vectorNodeInset(node)
  const local=node.path?parseEditableVector(node.path.d,{ox:inset.x,oy:inset.y,sx:Math.max(0,base.frame.width-2*inset.x)/node.path.width,sy:Math.max(0,base.frame.height-2*inset.y)/node.path.height},1.25/scale):null
  const m=base.frame.matrix
  return local?mapEditableVector(local,p=>({x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]})):{contours:[]}
}
function parts(path:EditableVector,selection?:VectorPart):VectorPart[]{
  const list:VectorPart[]=[]
  path.contours.forEach((contour,ci)=>{contour.anchors.forEach((anchor,ai)=>{
    list.push({contour:ci,anchor:ai,part:'anchor'})
    if(anchor.seg.kind==='cubic'&&(ai>0||contour.closed))for(const part of ['c','c2'] as const)if(vectorControlVisible(contour,ci,ai,part,selection))list.push({contour:ci,anchor:ai,part})
  })})
  return list
}
const pathSignature=(node:ArtifactNode,base:VectorEditBase)=>JSON.stringify([node.x,node.y,node.width,node.height,node.rotation,node.flipX,node.flipY,node.path,base.frame,vectorNodeInset(node)])
const CanvasPointEditor=forwardRef<CanvasPointHandle,Props>(function CanvasPointEditor(props,ref){
  const initial=useRef<{base:VectorEditBase;path:EditableVector}|null>(null)
  if(!initial.current){const restored=props.drafts.get(props.pageId,props.node.id),base=restored??props.capture();if(base)initial.current={base,path:restored?.path??parsed(props.node,base,props.view().scale)}}
  const [path,setPath]=useState<EditableVector>(initial.current?.path??{contours:[]}),pathRef=useRef(path),[selection,setSelection]=useState<VectorPart>(),selected=useRef(selection)
  const [view,setView]=useState(props.view),[insertAt,setInsertAt]=useState<PenPoint>(),[touch,setTouch]=useState(window.matchMedia('(pointer:coarse)').matches)
  const active=useRef<Gesture|null>(null),svg=useRef<SVGSVGElement|null>(null),mounted=useRef(false),latest=useRef(props);latest.current=props
  const ownSignature=useRef<string|null>(null)
  const latestInsert=useRef<{at:number;selection:VectorPart}|null>(null)
  useLayoutEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
  useLayoutEffect(()=>{const next=props.view();setView(old=>old.scale===next.scale&&old.offsetX===next.offsetX&&old.offsetY===next.offsetY?old:next)},[props.view])
  useEffect(()=>{
    const base=props.capture();if(!base)return
    const signature=pathSignature(props.node,base)
    if(signature===ownSignature.current)return
    if(active.current||props.drafts.get(props.pageId,props.node.id))return
    ownSignature.current=signature
    const next=parsed(props.node,base,props.view().scale);pathRef.current=next;setPath(next)
    const sel=selected.current;if(sel&&!next.contours[sel.contour]?.anchors[sel.anchor])choose(undefined)
  },[props.node,props.capture,props.drafts,props.pageId,props.view])
  useEffect(()=>{props.focus();props.announce(`正在编辑路径，共 ${pathRef.current.contours.reduce((n,c)=>n+c.anchors.length,0)} 个控制点。按制表键切换，按方向键微调。`)},[])
  useLocalDraft(reason=>{if(reason==='unmount')queueMicrotask(()=>{if(!mounted.current)finish()});else finish()})
  function choose(part:VectorPart|undefined){selected.current=part;setSelection(part)}
  function begin(selection:VectorPart,kind:Gesture['kind'],mode:Gesture['mode']='move'):Gesture|undefined {
    if(!latest.current.writable||!latest.current.isWritable())return
    const prior=latest.current.drafts.get(latest.current.pageId,latest.current.node.id),base=prior??latest.current.capture()
    if(!base)return
    return{before:pathRef.current,pathBase:pathRef.current,base,prior,kind,selection,mode,moved:false}
  }
  function update(next:EditableVector,gesture:Gesture){
    pathRef.current=next;setPath(next)
    props.drafts.set({...gesture.base,pageId:props.pageId,nodeId:props.node.id,path:next})
  }
  function finish(){
    const draft=latest.current.drafts.get(latest.current.pageId,latest.current.node.id);active.current=null
    if(!draft)return true
    if(!latest.current.writable||!latest.current.isWritable()){latest.current.drafts.block(latest.current.pageId,latest.current.node.id);return false}
    const node=draft.document.pages[draft.pageId]?.nodes[draft.nodeId]
    const patch=node?vectorNodePatch(draft.path,node,draft.frame):null
    if(!patch){latest.current.error('路径过大，无法保存。请缩小路径，或下载本地副本。');latest.current.drafts.block(draft.pageId,draft.nodeId);return false}
    if(!latest.current.commit(patch,draft,vectorReadKeys(draft.document,draft.pageId,draft.nodeId))){latest.current.drafts.block(draft.pageId,draft.nodeId);return false}
    latest.current.drafts.delete(draft.pageId,draft.nodeId);return true
  }
  function cancel(){
    const gesture=active.current;if(!gesture)return;active.current=null
    let next=gesture.before
    if(gesture.prior)props.drafts.set(gesture.prior)
    else{
      props.drafts.delete(props.pageId,props.node.id)
      const base=latest.current.capture(),node=base?.document.pages[props.pageId]?.nodes[props.node.id]
      if(base&&node){
        const signature=pathSignature(node,base)
        if(signature!==ownSignature.current){next=parsed(node,base,latest.current.view().scale);ownSignature.current=signature}
      }
    }
    pathRef.current=next;setPath(next)
  }
  function discard(){active.current=null;props.drafts.delete(props.pageId,props.node.id)}
  useEffect(()=>{
    const keyup=(event:KeyboardEvent)=>{if(arrows[event.key]&&active.current?.kind==='keyboard')finish()}
    const pointer=(event:PointerEvent)=>{if(active.current?.kind==='keyboard')finish();else if(active.current?.kind==='pointer'&&active.current.pointerId===event.pointerId&&event.type==='pointerup')cancel()}
    const blur=()=>{if(active.current?.kind==='keyboard')finish()}
    window.addEventListener('keyup',keyup,true);window.addEventListener('pointerdown',pointer,true);window.addEventListener('pointerup',pointer);window.addEventListener('blur',blur)
    return()=>{window.removeEventListener('keyup',keyup,true);window.removeEventListener('pointerdown',pointer,true);window.removeEventListener('pointerup',pointer);window.removeEventListener('blur',blur)}
  },[])
  function key(event:Key):boolean {
    if(event.ctrlKey||event.metaKey||event.altKey&&event.key!=='Tab')return false
    const consume=()=>{event.preventDefault();event.stopPropagation();return true}
    if(active.current?.kind==='keyboard'&&!arrows[event.key]){finish();return consume()}
    if(event.key==='Escape'){
      if(active.current)cancel();else{finish();props.done();props.announce('已结束控制点编辑。')}
      return consume()
    }
    if(event.key==='Tab'){
      const targets=vectorTabParts(pathRef.current);if(!targets.length)return consume()
      const current=targets.findIndex(item=>samePart(item.sel,selected.current)),fallback=event.shiftKey?targets.map(item=>item.sel.part).lastIndexOf('anchor'):0,index=current<0?fallback:(current+(event.shiftKey?targets.length-1:1))%targets.length,target=targets[index]
      choose(target.sel);props.announce(target.sel.part==='anchor'?`已选择第 ${target.point+1} 个控制点。`:`已选择第 ${target.point+1} 个控制点的${target.sel.part==='c'?'出':'入'}切线。`)
      return consume()
    }
    const sel=selected.current
    if(arrows[event.key]){
      if(!sel||!props.writable||!props.isWritable())return consume()
      const gesture=active.current??begin(sel,'keyboard');if(!gesture)return consume();active.current=gesture
      const at=vectorPartPoint(pathRef.current,sel),delta=arrows[event.key],step=event.shiftKey?10:1
      if(at)update(moveVectorPart(pathRef.current,sel,{x:at.x+delta[0]*step,y:at.y+delta[1]*step}),gesture)
      return consume()
    }
    if(event.key==='Enter'){
      if(sel?.part==='anchor'&&!event.shiftKey){const gesture=begin(sel,'keyboard');if(gesture){update(toggleVectorSmooth(pathRef.current,sel),gesture);finish();props.announce('已切换控制点的平滑状态。')}}
      return consume()
    }
    if(event.key==='Delete'||event.key==='Backspace'){
      if(!sel||sel.part!=='anchor'||!props.writable||!props.isWritable())return consume()
      const next=deleteVectorPoint(pathRef.current,sel)
      if(!next)return false
      const gesture=begin(sel,'keyboard');if(!gesture)return consume()
      choose(next.contours.length===pathRef.current.contours.length?{...sel,anchor:Math.max(0,sel.anchor-1)}:undefined)
      update(next,gesture);finish();props.announce('已删除控制点。');return consume()
    }
    return false
  }
  useImperativeHandle(ref,()=>({key,discard,isDragging:()=>active.current?.kind==='pointer'}))
  const radius=touch?20:10,controlSize=Math.max(3.5,radius*.45),accent='var(--native-vector-accent,#257de0)',surface='var(--native-panel,#fff)'
  const screen=(p:PenPoint)=>({x:view.offsetX+p.x*view.scale,y:view.offsetY+p.y*view.scale})
  const hit=(point:PenPoint,hitRadius:number)=>{
    let best:VectorPart|undefined,distance=(hitRadius/props.view().scale)**2
    for(const part of parts(pathRef.current,selected.current)){const p=vectorPartPoint(pathRef.current,part);if(!p)continue;const next=(point.x-p.x)**2+(point.y-p.y)**2;if(next<=distance){distance=next;best=part}}
    return best
  }
  function down(event:ReactPointerEvent){
    if(event.button===1||props.isPanning()){props.pan(event);return}
    if(event.button!==0||active.current)return
    event.stopPropagation();props.focus();setTouch(event.pointerType==='touch'||window.matchMedia('(pointer:coarse)').matches)
    if(!props.writable||!props.isWritable())return
    const point=props.view().toWorld(event),hitRadius=Math.max(event.pointerType==='touch'?20:10,radius),part=hit(point,hitRadius),nearest=part?undefined:nearestVectorSegment(pathRef.current,point,hitRadius/props.view().scale),inserted=nearest?splitVectorSegment(pathRef.current,nearest):undefined,sel=inserted?.sel??part
    choose(sel);if(!sel)return
    event.preventDefault();const mode=inserted?'insert':event.altKey?sel.part==='anchor'?'pull':'break':'move',gesture=begin(sel,'pointer',mode)
    if(!gesture)return
    gesture.pathBase=inserted?.path??(mode==='break'?breakVectorTangent(pathRef.current,sel):pathRef.current)
    gesture.pointerId=event.pointerId;gesture.screen={x:event.clientX,y:event.clientY};gesture.model=point
    const anchor=vectorPartPoint(gesture.pathBase,sel);gesture.offset=anchor?{x:anchor.x-point.x,y:anchor.y-point.y}:{x:0,y:0};active.current=gesture
    if(inserted){update(inserted.path,gesture);setInsertAt(undefined);latestInsert.current={at:performance.now(),selection:sel}}
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function move(event:ReactPointerEvent){
    const gesture=active.current,point=props.view().toWorld(event)
    if(!gesture){if(!event.buttons&&props.writable)setInsertAt(hit(point,radius)?undefined:nearestVectorSegment(pathRef.current,point,radius/props.view().scale)?.at);return}
    if(gesture.kind!=='pointer'||gesture.pointerId!==event.pointerId||!props.writable||!props.isWritable())return
    event.stopPropagation()
    if(!gesture.moved&&Math.hypot(event.clientX-gesture.screen!.x,event.clientY-gesture.screen!.y)<4)return
    gesture.moved=true
    const target={x:point.x+gesture.offset!.x,y:point.y+gesture.offset!.y},contour=gesture.pathBase.contours[gesture.selection.contour],anchor=contour.anchors[gesture.selection.anchor],before=contour.anchors[gesture.selection.anchor-1]??(contour.closed?contour.anchors.at(-1):undefined)
    const origin=gesture.mode==='pull'?anchor:gesture.selection.part==='c'?before:gesture.selection.part==='c2'?anchor:before
    const to=event.shiftKey?constrainVectorAngle(origin??{x:gesture.model!.x+gesture.offset!.x,y:gesture.model!.y+gesture.offset!.y},target):target
    update(gesture.mode==='pull'?pullVectorHandles(gesture.pathBase,gesture.selection,to):moveVectorPart(gesture.pathBase,gesture.selection,to),gesture)
  }
  function up(event:ReactPointerEvent,canceled=false){
    const gesture=active.current;if(!gesture||gesture.kind!=='pointer'||gesture.pointerId!==event.pointerId)return
    event.stopPropagation();if(canceled)cancel();else finish()
  }
  const visual=mapEditableVector(path,screen),d=vectorSvgPath(visual),targets=parts(path,selection),tethers:Array<{from:PenPoint;to:PenPoint;part:VectorPart}>=[]
  for(const part of targets)if(part.part!=='anchor'){
    const contour=path.contours[part.contour],anchor=contour.anchors[part.anchor],owner=part.part==='c'?contour.anchors[part.anchor-1]??contour.anchors.at(-1)!:anchor,to=vectorPartPoint(path,part)!
    tethers.push({from:screen(owner),to:screen(to),part})
  }
  return <svg ref={svg} data-native-vector-editor role="group" aria-label="路径控制点" style={{position:'absolute',inset:0,width:'100%',height:'100%',overflow:'visible',pointerEvents:'none',zIndex:1002}}>
    <path d={d} fill="none" stroke={props.node.style.stroke??'#8a8378'} strokeWidth={(props.node.style.strokeWidth??2)*view.scale} strokeLinecap="round" strokeLinejoin="round" opacity={props.node.style.opacity} />
    <path d={d} fill="none" stroke={accent} strokeWidth={1} />
    {tethers.map(({from,to,part})=><g key={`${part.contour}:${part.anchor}:${part.part}`} aria-hidden="true"><line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={surface} strokeWidth={3} /><line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={accent} /></g>)}
    {targets.map(part=>{const p=screen(vectorPartPoint(path,part)!),chosen=samePart(part,selection);return part.part==='anchor'?<rect aria-hidden="true" key={`a:${part.contour}:${part.anchor}`} x={p.x-controlSize-(chosen?1:0)} y={p.y-controlSize-(chosen?1:0)} width={2*(controlSize+(chosen?1:0))} height={2*(controlSize+(chosen?1:0))} fill={chosen?surface:accent} stroke={chosen?accent:surface} strokeWidth={chosen?1.5:1} />:<circle aria-hidden="true" key={`${part.part}:${part.contour}:${part.anchor}`} cx={p.x} cy={p.y} r={chosen?controlSize+1:controlSize-.5} fill={chosen?accent:surface} stroke={accent} strokeWidth={1.25} />})}
    {insertAt&&<rect aria-hidden="true" x={screen(insertAt).x-controlSize+1} y={screen(insertAt).y-controlSize+1} width={2*controlSize-2} height={2*controlSize-2} fill={accent} stroke={surface} opacity={.6} />}
    <path data-vector-segments d={d} fill="none" stroke="transparent" strokeWidth={2*radius} style={{pointerEvents:'stroke',touchAction:'none',cursor:'default'}} onPointerDown={down} onPointerMove={move} onPointerUp={event=>up(event)} onPointerCancel={event=>up(event,true)} />
    {targets.map(part=>{const p=screen(vectorPartPoint(path,part)!);return <circle key={`${part.part}:${part.contour}:${part.anchor}`} data-vector-part={`${part.part==='anchor'?'a':part.part}:${part.contour}:${part.anchor}`} aria-label={part.part==='anchor'?`第 ${part.anchor+1} 个控制点`:`第 ${(part.part==='c'?(part.anchor>0?part.anchor:path.contours[part.contour].anchors.length):part.anchor+1)} 个控制点的${part.part==='c'?'出':'入'}切线`} cx={p.x} cy={p.y} r={radius} fill="transparent" style={{pointerEvents:'auto',touchAction:'none',cursor:'default'}} onPointerDown={down} onPointerMove={move} onPointerUp={event=>up(event)} onPointerCancel={event=>up(event,true)} onDoubleClick={event=>{event.stopPropagation();const recent=latestInsert.current;if(recent&&samePart(recent.selection,part)&&performance.now()-recent.at<500)return;if(part.part==='anchor'){const gesture=begin(part,'keyboard');if(gesture){update(toggleVectorSmooth(pathRef.current,part),gesture);finish()}}}} />})}
  </svg>
})
export default CanvasPointEditor
