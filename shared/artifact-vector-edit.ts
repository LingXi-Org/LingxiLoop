import {isArtifactPenPath} from './artifact-path.js'
import {fitPenPoints,splitPenExtrema,type PenGeometry,type PenPoint} from './artifact-pen.js'

export type VectorSegment={kind:'line'}|{kind:'cubic';c1:PenPoint;c2:PenPoint}
export interface VectorAnchor extends PenPoint {seg:VectorSegment;tangent?:'corner'|'smooth'|'symmetric'}
export interface VectorContour {anchors:VectorAnchor[];closed:boolean}
export interface EditableVector {contours:VectorContour[]}
export interface VectorPart {contour:number;anchor:number;part:'anchor'|'c'|'c2'}
export interface VectorTransform {ox:number;oy:number;sx:number;sy:number}
export interface VectorNearest {contour:number;anchor:number;t:number;at:PenPoint;dist:number}
const point=(p:PenPoint):PenPoint=>({x:p.x,y:p.y})
const equal=(a:PenPoint,b:PenPoint)=>a.x===b.x&&a.y===b.y
const distance=(a:PenPoint,b:PenPoint)=>Math.hypot(a.x-b.x,a.y-b.y)
const lerp=(a:PenPoint,b:PenPoint,t:number):PenPoint=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t})
const previous=(c:VectorContour,i:number)=>c.anchors[i-1]??(c.closed?c.anchors.at(-1):undefined)
const nextIndex=(c:VectorContour,i:number)=>i+1<c.anchors.length?i+1:c.closed?0:-1
function replaceContour(path:EditableVector,index:number,anchors:VectorAnchor[]):EditableVector {
  return{contours:path.contours.map((contour,i)=>i===index?{...contour,anchors}:contour)}
}
function cubicAt(a:PenPoint,c1:PenPoint,c2:PenPoint,b:PenPoint,t:number):PenPoint {
  return lerp(lerp(lerp(a,c1,t),lerp(c1,c2,t),t),lerp(lerp(c1,c2,t),lerp(c2,b,t),t),t)
}
export function vectorSegmentPoint(a:PenPoint,b:VectorAnchor,t:number):PenPoint {
  return b.seg.kind==='line'?lerp(a,b,t):cubicAt(a,b.seg.c1,b.seg.c2,b,t)
}
function mergeSplitCurves(anchors:VectorAnchor[],tolerance:PenPoint,protectedPoints:PenPoint[]):VectorAnchor[]{
  const merged:VectorAnchor[]=[],near=(a:PenPoint,b:PenPoint)=>Math.abs(a.x-b.x)<=tolerance.x&&Math.abs(a.y-b.y)<=tolerance.y
  for(const end of anchors){
    const start=merged.at(-2),middle=merged.at(-1)
    if(start&&middle?.seg.kind==='cubic'&&end.seg.kind==='cubic'&&!protectedPoints.some(p=>Math.abs(p.x-middle.x)<=4*tolerance.x&&Math.abs(p.y-middle.y)<=4*tolerance.y)){
      const arriving=middle.seg.c2,departing=end.seg.c1
      const flat=[arriving,departing].every(p=>Math.abs(p.y-middle.y)<=tolerance.y)||[arriving,departing].every(p=>Math.abs(p.x-middle.x)<=tolerance.x)
      const t=distance(arriving,middle)/(distance(arriving,middle)+distance(departing,middle))
      if(flat&&t>0&&t<1){
        const c1=lerp(start,middle.seg.c1,1/t),c2=lerp(end,end.seg.c2,1/(1-t))
        if([.25,.5,.75].every(u=>near(cubicAt(start,c1,c2,end,t*u),cubicAt(start,middle.seg.kind==='cubic'?middle.seg.c1:start,arriving,middle,u))&&near(cubicAt(start,c1,c2,end,t+(1-t)*u),cubicAt(middle,departing,end.seg.kind==='cubic'?end.seg.c2:end,end,u)))&&near(cubicAt(start,c1,c2,end,t),middle)){
          merged[merged.length-1]={...end,seg:{kind:'cubic',c1,c2}};continue
        }
      }
    }
    merged.push(end)
  }
  return merged
}
function inferTangent(contour:VectorContour,index:number):'corner'|'smooth' {
  const anchor=contour.anchors[index],next=contour.anchors[nextIndex(contour,index)]
  if(index===0&&!contour.closed||anchor.seg.kind!=='cubic'||next?.seg.kind!=='cubic')return 'corner'
  const ax=anchor.x-anchor.seg.c2.x,ay=anchor.y-anchor.seg.c2.y,bx=next.seg.c1.x-anchor.x,by=next.seg.c1.y-anchor.y,length=Math.hypot(ax,ay)*Math.hypot(bx,by)
  return length>0&&(ax*bx+ay*by)/length>=Math.cos(6*Math.PI/180)?'smooth':'corner'
}

/** Parse only the existing inert M/L/C document field. Twelve-point legacy
 * line runs use the source's fitting tolerance; split extrema are rejoined. */
export function parseEditableVector(d:string,transform:VectorTransform,tolerance:number,protectedPoints:PenPoint[]=[]):EditableVector|null {
  if(!isArtifactPenPath(d))return null
  const contours:VectorContour[]=[];let anchors:VectorAnchor[]=[],lines:PenPoint[]=[]
  const map=(x:number,y:number)=>({x:transform.ox+x*transform.sx,y:transform.oy+y*transform.sy})
  const flushLines=()=>{
    if(lines.length>=2){
      const curve=lines.length>=12?fitPenPoints(lines,tolerance):null
      if(curve&&curve.length>4){for(let i=2;i+5<curve.length;i+=6)anchors.push({x:curve[i+4],y:curve[i+5],seg:{kind:'cubic',c1:{x:curve[i],y:curve[i+1]},c2:{x:curve[i+2],y:curve[i+3]}}})}
      else for(const p of lines.slice(1))anchors.push({...p,seg:{kind:'line'}})
    }
    lines=[]
  }
  const flushContour=()=>{
    flushLines();if(!anchors.length)return
    anchors=mergeSplitCurves(anchors,{x:.15*Math.abs(transform.sx),y:.15*Math.abs(transform.sy)},protectedPoints)
    const first=anchors[0],last=anchors.at(-1)!,closed=anchors.length>2&&equal(first,last)
    if(closed){anchors[0]={...first,seg:last.seg};anchors.pop()}
    const contour={anchors,closed}
    contours.push({...contour,anchors:anchors.map((anchor,i)=>({...anchor,tangent:inferTangent(contour,i)}))});anchors=[]
  }
  for(const command of d.match(/[MLC][^MLC]*/g)??[]){
    const values=(command.slice(1).match(/\d+(?:\.\d+)?/g)??[]).map(Number)
    if(command[0]==='M'){
      flushContour();const p=map(values[0],values[1]);anchors=[{...p,seg:{kind:'line'}}];lines=[p]
    }else if(command[0]==='L'){
      if(!lines.length)lines=[point(anchors.at(-1)!)]
      lines.push(map(values[0],values[1]))
    }else{
      flushLines();const previous=anchors.at(-1)!,end=map(values[4],values[5]),c1=map(values[0],values[1]),c2=map(values[2],values[3])
      if(anchors.length>1&&[end,c1,c2].every(p=>(p.x-previous.x)**2+(p.y-previous.y)**2<.25))continue
      anchors.push({...end,seg:equal(c1,previous)&&equal(c2,end)?{kind:'line'}:{kind:'cubic',c1,c2}})
    }
  }
  flushContour();return{contours}
}
function openedContours(path:EditableVector):VectorContour[]{
  return path.contours.map(c=>c.closed&&c.anchors[0]?{closed:false,anchors:[{...c.anchors[0],seg:{kind:'line'}},...c.anchors.slice(1),c.anchors[0]]}:c)
}
export function vectorSvgPath(path:EditableVector):string {
  const commands:string[]=[],label=(p:PenPoint)=>`${p.x} ${p.y}`
  for(const contour of path.contours){
    if(!contour.anchors.length)continue
    commands.push('M'+label(contour.anchors[0]))
    for(let i=1;i<contour.anchors.length+(contour.closed?1:0);i++){
      const anchor=contour.anchors[i%contour.anchors.length]
      if(anchor.seg.kind==='cubic')commands.push('C'+label(anchor.seg.c1)+' '+label(anchor.seg.c2)+' '+label(anchor))
      else if(i<contour.anchors.length)commands.push('L'+label(anchor))
    }
    if(contour.closed)commands.push('Z')
  }
  return commands.join(' ')
}
export function mapEditableVector(path:EditableVector,map:(p:PenPoint)=>PenPoint):EditableVector {
  return{contours:path.contours.map(c=>({...c,anchors:c.anchors.map(a=>({...a,...map(a),seg:a.seg.kind==='cubic'?{kind:'cubic',c1:map(a.seg.c1),c2:map(a.seg.c2)}:a.seg}))}))}
}
export function normalizeEditableVector(path:EditableVector):PenGeometry|null {
  const opened=openedContours(path),samples:PenPoint[]=[]
  for(const contour of opened)for(let i=0;i<contour.anchors.length;i++){
    const a=contour.anchors[i],previous=contour.anchors[i-1];samples.push(a)
    if(previous&&a.seg.kind==='cubic')for(let j=1;j<16;j++){
      const t=j/16,v=1-t
      samples.push({x:v*v*v*previous.x+3*v*v*t*a.seg.c1.x+3*v*t*t*a.seg.c2.x+t*t*t*a.x,y:v*v*v*previous.y+3*v*v*t*a.seg.c1.y+3*v*t*t*a.seg.c2.y+t*t*t*a.y})
    }
  }
  if(!samples.length)return null
  const left=Math.min(...samples.map(p=>p.x)),right=Math.max(...samples.map(p=>p.x)),top=Math.min(...samples.map(p=>p.y)),bottom=Math.max(...samples.map(p=>p.y))
  const within=(p:PenPoint)=>p.x>=left-.5&&p.x<=right+.5&&p.y>=top-.5&&p.y<=bottom+.5
  const flattened=opened.map(contour=>{
    const anchors:VectorAnchor[]=[]
    for(const anchor of contour.anchors){
      const previous=anchors.at(-1)
      if(!previous||anchor.seg.kind!=='cubic'||within(anchor.seg.c1)&&within(anchor.seg.c2)){anchors.push(anchor);continue}
      const curve=splitPenExtrema([previous.x,previous.y,anchor.seg.c1.x,anchor.seg.c1.y,anchor.seg.c2.x,anchor.seg.c2.y,anchor.x,anchor.y])
      for(let i=2;i+5<curve.length;i+=6)anchors.push({x:curve[i+4],y:curve[i+5],seg:{kind:'cubic',c1:{x:curve[i],y:curve[i+1]},c2:{x:curve[i+2],y:curve[i+3]}}})
    }
    return anchors
  })
  const controls=flattened.flatMap(anchors=>anchors.flatMap((a,i)=>i>0&&a.seg.kind==='cubic'?[a,a.seg.c1,a.seg.c2]:[a]))
  const x=Math.min(...controls.map(p=>p.x)),y=Math.min(...controls.map(p=>p.y)),width=Math.max(...controls.map(p=>p.x))-x,height=Math.max(...controls.map(p=>p.y))-y
  for(const precision of [3,2,1]){
    const round=(n:number)=>Math.round(n*10**precision)/10**precision
    const number=(n:number)=>{const s=round(n).toFixed(precision).replace(/\.?0+$/,'');return s==='-0'?'0':s}
    const label=(p:PenPoint)=>number(p.x-x)+' '+number(p.y-y)
    const commands:string[]=[]
    for(const anchors of flattened){let lines=1;for(let i=0;i<anchors.length;i++){
      const a=anchors[i];lines=i>0&&a.seg.kind==='line'?lines+1:1
      if(i===0)commands.push('M'+label(a))
      else if(a.seg.kind==='cubic')commands.push('C'+label(a.seg.c1)+' '+label(a.seg.c2)+' '+label(a))
      else if(lines>=12){commands.push('C'+label(anchors[i-1])+' '+label(a)+' '+label(a));lines=1}
      else commands.push('L'+label(a))
    }}
    const d=commands.join(' ')
    if(isArtifactPenPath(d))return round(width)>8000||round(height)>8000?null:{x:Math.round(x*10)/10,y:Math.round(y*10)/10,w:Math.max(2,round(width)),h:Math.max(2,round(height)),d}
  }
  return null
}
export function vectorPartPoint(path:EditableVector,selection:VectorPart):PenPoint|undefined {
  const anchor=path.contours[selection.contour]?.anchors[selection.anchor]
  return !anchor||selection.part==='anchor'||anchor.seg.kind==='line'?anchor:selection.part==='c'?anchor.seg.c1:anchor.seg.c2
}
export function vectorControlVisible(contour:VectorContour,contourIndex:number,anchorIndex:number,part:'c'|'c2',selection?:VectorPart):boolean {
  if(!selection||selection.contour!==contourIndex)return false
  const owner=(index:number,kind:VectorPart['part'])=>kind==='c'?index>0?index-1:contour.closed?contour.anchors.length-1:-1:index
  const selectedOwner=owner(selection.anchor,selection.part)
  if(selectedOwner<0||owner(anchorIndex,part)!==selectedOwner)return false
  const segment=contour.anchors[anchorIndex]?.seg,anchor=contour.anchors[selectedOwner]
  return segment?.kind!=='cubic'||!anchor||!equal(part==='c'?segment.c1:segment.c2,anchor)
}
export function vectorTabParts(path:EditableVector):Array<{sel:VectorPart;point:number}>{
  const parts:Array<{sel:VectorPart;point:number}>=[];let index=0
  path.contours.forEach((contour,ci)=>{contour.anchors.forEach((_,ai)=>{
    const sel:VectorPart={contour:ci,anchor:ai,part:'anchor'}
    parts.push({sel,point:index})
    for(const candidate of [{contour:ci,anchor:ai,part:'c2' as const},{contour:ci,anchor:nextIndex(contour,ai),part:'c' as const}])if(contour.anchors[candidate.anchor]?.seg.kind==='cubic'&&vectorControlVisible(contour,ci,candidate.anchor,candidate.part,sel))parts.push({sel:candidate,point:index})
    index++
  })})
  return parts
}
function alignTangent(path:EditableVector,contourIndex:number,anchorIndex:number,side:'arriving'|'departing'):EditableVector {
  const contour=path.contours[contourIndex],anchor=contour?.anchors[anchorIndex]
  if(!anchor||!anchor.tangent||anchor.tangent==='corner')return path
  const ni=nextIndex(contour,anchorIndex),next=contour.anchors[ni]
  if(anchor.seg.kind!=='cubic'||next?.seg.kind!=='cubic'||anchorIndex===0&&!contour.closed)return path
  const handle=side==='arriving'?anchor.seg.c2:next.seg.c1,opposite=side==='arriving'?next.seg.c1:anchor.seg.c2
  const dx=anchor.x-handle.x,dy=anchor.y-handle.y,length=Math.hypot(dx,dy)
  if(!length)return path
  const radius=anchor.tangent==='symmetric'?length:distance(opposite,anchor),target={x:anchor.x+dx/length*radius,y:anchor.y+dy/length*radius},anchors=contour.anchors.slice()
  if(side==='arriving')anchors[ni]={...next,seg:{...next.seg,c1:target}}
  else anchors[anchorIndex]={...anchor,seg:{...anchor.seg,c2:target}}
  return replaceContour(path,contourIndex,anchors)
}
export function moveVectorPart(path:EditableVector,selection:VectorPart,to:PenPoint):EditableVector {
  const contour=path.contours[selection.contour],anchor=contour?.anchors[selection.anchor]
  if(!anchor)return path
  const anchors=contour.anchors.slice(),ni=nextIndex(contour,selection.anchor)
  if(selection.part==='anchor'){
    const dx=to.x-anchor.x,dy=to.y-anchor.y
    anchors[selection.anchor]={...anchor,...to,seg:anchor.seg.kind==='cubic'?{...anchor.seg,c2:{x:anchor.seg.c2.x+dx,y:anchor.seg.c2.y+dy}}:anchor.seg}
    const next=anchors[ni]
    if(next?.seg.kind==='cubic')anchors[ni]={...next,seg:{...next.seg,c1:{x:next.seg.c1.x+dx,y:next.seg.c1.y+dy}}}
  }else if(anchor.seg.kind==='cubic')anchors[selection.anchor]={...anchor,seg:{...anchor.seg,...(selection.part==='c'?{c1:to}:{c2:to})}}
  else return path
  let result=replaceContour(path,selection.contour,anchors)
  if(selection.part==='c'){const pi=selection.anchor>0?selection.anchor-1:contour.closed?anchors.length-1:-1;if(pi>=0)result=alignTangent(result,selection.contour,pi,'departing')}
  else if(selection.part==='c2')result=alignTangent(result,selection.contour,selection.anchor,'arriving')
  else{
    result=alignTangent(result,selection.contour,selection.anchor,'arriving')
    const pi=selection.anchor>0?selection.anchor-1:contour.closed?anchors.length-1:-1,following=selection.anchor+1<anchors.length?selection.anchor+1:0
    if(pi>=0&&pi!==following)result=alignTangent(result,selection.contour,pi,'departing')
  }
  return result
}
function controlsFor(previous:PenPoint,anchor:VectorAnchor):{c1:PenPoint;c2:PenPoint} {
  return anchor.seg.kind==='cubic'?anchor.seg:{c1:point(previous),c2:point(anchor)}
}
function setHandles(path:EditableVector,selection:VectorPart,arriving:PenPoint,departing:PenPoint,tangent:'corner'|'smooth'):EditableVector {
  const contour=path.contours[selection.contour],anchor=contour?.anchors[selection.anchor]
  if(!anchor)return path
  const before=previous(contour,selection.anchor),ni=nextIndex(contour,selection.anchor),after=contour.anchors[ni],anchors=contour.anchors.slice()
  const segment=(from:PenPoint,c1:PenPoint,c2:PenPoint,to:PenPoint):VectorSegment=>equal(from,c1)&&equal(to,c2)?{kind:'line'}:{kind:'cubic',c1,c2}
  anchors[selection.anchor]={...anchor,tangent,seg:before?segment(before,controlsFor(before,anchor).c1,arriving,anchor):anchor.seg}
  if(after&&after!==anchor)anchors[ni]={...after,seg:segment(anchor,departing,controlsFor(anchor,after).c2,after)}
  return replaceContour(path,selection.contour,anchors)
}
export function toggleVectorSmooth(path:EditableVector,selection:VectorPart):EditableVector {
  const contour=path.contours[selection.contour],anchor=contour?.anchors[selection.anchor]
  if(!anchor)return path
  const before=previous(contour,selection.anchor),after=contour.anchors[nextIndex(contour,selection.anchor)]
  if(before&&!equal(controlsFor(before,anchor).c2,anchor)||after&&!equal(controlsFor(anchor,after).c1,anchor))return setHandles(path,selection,point(anchor),point(anchor),'corner')
  const dx=(after??anchor).x-(before??anchor).x,dy=(after??anchor).y-(before??anchor).y,length=Math.hypot(dx,dy)
  if(!length)return path
  const a=before?distance(before,anchor)/3/length:0,b=after?distance(after,anchor)/3/length:0
  return setHandles(path,selection,{x:anchor.x-dx*a,y:anchor.y-dy*a},{x:anchor.x+dx*b,y:anchor.y+dy*b},'smooth')
}
export function pullVectorHandles(path:EditableVector,selection:VectorPart,to:PenPoint):EditableVector {
  const anchor=path.contours[selection.contour]?.anchors[selection.anchor]
  return anchor?setHandles(path,selection,{x:2*anchor.x-to.x,y:2*anchor.y-to.y},to,'smooth'):path
}
export function breakVectorTangent(path:EditableVector,selection:VectorPart):EditableVector {
  const contour=path.contours[selection.contour],anchor=contour?.anchors[selection.anchor]
  if(!anchor||selection.part==='anchor')return path
  const owner=selection.part==='c'&&anchor.seg.kind==='cubic'?selection.anchor>0?selection.anchor-1:contour.anchors.length-1:selection.anchor,anchors=contour.anchors.slice()
  anchors[owner]={...anchors[owner],tangent:'corner'}
  return replaceContour(path,selection.contour,anchors)
}
export function deleteVectorPoint(path:EditableVector,selection:VectorPart):EditableVector|null {
  const contour=path.contours[selection.contour]
  if(!contour?.anchors[selection.anchor])return path
  if(contour.anchors.length<3){const contours=path.contours.filter((_,i)=>i!==selection.contour);return contours.length?{contours}:null}
  const anchors=contour.anchors.slice(),anchor=anchors[selection.anchor],before=previous(contour,selection.anchor),ni=nextIndex(contour,selection.anchor),after=anchors[ni]
  if(!before)anchors[1]={...anchors[1],seg:{kind:'line'}}
  else if(after){
    const incoming=anchor.seg.kind==='cubic'&&after.seg.kind==='cubic'?distance(anchor.seg.c2,anchor):0,outgoing=anchor.seg.kind==='cubic'&&after.seg.kind==='cubic'?distance(after.seg.c1,anchor):0,t=anchor.tangent==='smooth'&&incoming>0&&outgoing>0?incoming/(incoming+outgoing):null
    const c1=anchor.seg.kind==='cubic'?t===null?anchor.seg.c1:lerp(before,anchor.seg.c1,1/t):point(before),c2=after.seg.kind==='cubic'?t===null?after.seg.c2:lerp(after,after.seg.c2,1/(1-t)):point(after)
    anchors[ni]={...after,seg:equal(c1,before)&&equal(c2,after)?{kind:'line'}:{kind:'cubic',c1,c2}}
  }
  anchors.splice(selection.anchor,1);return replaceContour(path,selection.contour,anchors)
}
export function nearestVectorSegment(path:EditableVector,point:PenPoint,radius=Infinity):VectorNearest|undefined {
  let best:VectorNearest|undefined
  path.contours.forEach((contour,ci)=>{contour.anchors.forEach((anchor,ai)=>{
    const before=previous(contour,ai);if(!before||before===anchor)return
    const controls=controlsFor(before,anchor),all=[before,anchor,controls.c1,controls.c2]
    const outside=(axis:'x'|'y')=>Math.max(Math.min(...all.map(p=>p[axis]))-point[axis],0,point[axis]-Math.max(...all.map(p=>p[axis])))
    if(Math.hypot(outside('x'),outside('y'))>(best?.dist??radius))return
    const dist=(t:number)=>distance(vectorSegmentPoint(before,anchor,t),point)
    let t:number
    if(anchor.seg.kind==='line'){const dx=anchor.x-before.x,dy=anchor.y-before.y;t=Math.min(1,Math.max(0,((point.x-before.x)*dx+(point.y-before.y)*dy)/(dx*dx+dy*dy||1)))}
    else{
      let closest=0;for(let i=1;i<=32;i++)if(dist(i/32)<dist(closest/32))closest=i
      let lo=Math.max(0,(closest-1)/32),hi=Math.min(1,(closest+1)/32)
      for(let i=0;i<24;i++){const a=lo+(hi-lo)/3,b=hi-(hi-lo)/3;if(dist(a)<=dist(b))hi=b;else lo=a}
      t=(lo+hi)/2
    }
    const separation=dist(t)
    if(best?separation<best.dist:separation<=radius)best={contour:ci,anchor:ai,t,at:vectorSegmentPoint(before,anchor,t),dist:separation}
  })})
  return best
}
export function splitVectorSegment(path:EditableVector,nearest:VectorNearest):{path:EditableVector;sel:VectorPart}|undefined {
  const contour=path.contours[nearest.contour],anchor=contour?.anchors[nearest.anchor],before=contour&&previous(contour,nearest.anchor)
  if(!anchor||!before)return
  let inserted:VectorAnchor,remaining=anchor.seg
  if(anchor.seg.kind==='line')inserted={...lerp(before,anchor,nearest.t),seg:anchor.seg}
  else{
    const a=lerp(before,anchor.seg.c1,nearest.t),b=lerp(anchor.seg.c1,anchor.seg.c2,nearest.t),c=lerp(anchor.seg.c2,anchor,nearest.t),left=lerp(a,b,nearest.t),right=lerp(b,c,nearest.t)
    inserted={...lerp(left,right,nearest.t),seg:{kind:'cubic',c1:a,c2:left},tangent:'smooth'};remaining={kind:'cubic',c1:right,c2:c}
  }
  const anchors=contour.anchors.slice();anchors[nearest.anchor]={...anchor,seg:remaining}
  const index=nearest.anchor===0?anchors.length:nearest.anchor;anchors.splice(index,0,inserted)
  return{path:replaceContour(path,nearest.contour,anchors),sel:{contour:nearest.contour,anchor:index,part:'anchor'}}
}
