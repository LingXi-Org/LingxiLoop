import {splitPenExtrema,type PenGeometry,type PenPoint} from './artifact-pen.js'
import {isArtifactPenPath} from './artifact-path.js'

export interface VectorDraftPoint extends PenPoint {out?:PenPoint}
interface Segment {kind:'M'|'L'|'C';points:PenPoint[]}
export function constrainVectorAngle(origin:PenPoint,point:PenPoint):PenPoint {
  const x=point.x-origin.x,y=point.y-origin.y,length=Math.hypot(x,y),angle=Math.round(Math.atan2(y,x)/(Math.PI/4))*Math.PI/4
  return{x:origin.x+length*Math.cos(angle),y:origin.y+length*Math.sin(angle)}
}
export function canCloseVectorDraft(points:VectorDraftPoint[]):boolean{return points.length>=3||points.length===2&&points.some(point=>point.out)}
export function appendVectorPoint(points:VectorDraftPoint[],raw:PenPoint,scale:number,shift=false):VectorDraftPoint[]{
  const point=shift&&points.length?constrainVectorAngle(points.at(-1)!,raw):raw
  return[points[0],points.at(-1)].some(old=>old&&Math.hypot(old.x-point.x,old.y-point.y)*scale<4)?points:[...points,point]
}
export function vectorDraftPath(draft:VectorDraftPoint[],closed=false):string {
  if(!draft.length)return ''
  const label=(point:PenPoint)=>`${point.x} ${point.y}`
  let result='M'+label(draft[0])
  for(let i=1;i<draft.length+(closed?1:0);i++){
    const previous=draft[i-1],point=draft[i%draft.length]
    if(previous.out||point.out)result+=' C'+label(previous.out??previous)+' '+label(point.out?{x:2*point.x-point.out.x,y:2*point.y-point.out.y}:point)+' '+label(point)
    else if(i<draft.length)result+=' L'+label(point)
  }
  return result+(closed?' Z':'')
}

/** Native point-by-point geometry. The pinned source uses symmetric draft
 * tangents, splits control extrema, then tries three bounded decimal formats. */
export function canvasVectorGeometry(draft:VectorDraftPoint[],closed=false):PenGeometry|null {
  if(draft.length<2||closed&&!canCloseVectorDraft(draft))return null
  const segments:Segment[]=[{kind:'M',points:[draft[0]]}],anchors=closed?[...draft,draft[0]]:draft
  const box={left:Math.min(...draft.map(p=>p.x)),top:Math.min(...draft.map(p=>p.y)),right:Math.max(...draft.map(p=>p.x)),bottom:Math.max(...draft.map(p=>p.y))}
  // The reference's anchor bounds include fifteen interior samples per curve.
  // Tangents may extend beyond anchors while the curve remains within this box.
  for(let i=1;i<anchors.length;i++){
    const previous=anchors[i-1],point=anchors[i]
    if(!previous.out&&!point.out)continue
    const c1=previous.out??previous,c2=point.out?{x:2*point.x-point.out.x,y:2*point.y-point.out.y}:point
    for(let j=1;j<16;j++){
      const t=j/16,v=1-t,x=v*v*v*previous.x+3*v*v*t*c1.x+3*v*t*t*c2.x+t*t*t*point.x,y=v*v*v*previous.y+3*v*v*t*c1.y+3*v*t*t*c2.y+t*t*t*point.y
      box.left=Math.min(box.left,x);box.right=Math.max(box.right,x);box.top=Math.min(box.top,y);box.bottom=Math.max(box.bottom,y)
    }
  }
  const within=(point:PenPoint)=>point.x>=box.left-.5&&point.x<=box.right+.5&&point.y>=box.top-.5&&point.y<=box.bottom+.5
  let lineRun=1
  for(let i=1;i<anchors.length;i++){
    const previous=anchors[i-1],point=anchors[i]
    if(previous.out||point.out){
      lineRun=1
      const c1=previous.out??previous,c2=point.out?{x:2*point.x-point.out.x,y:2*point.y-point.out.y}:point
      if(within(c1)&&within(c2))segments.push({kind:'C',points:[c1,c2,point]})
      else{
        const curve=splitPenExtrema([previous.x,previous.y,c1.x,c1.y,c2.x,c2.y,point.x,point.y])
        for(let j=2;j+5<curve.length;j+=6)segments.push({kind:'C',points:[{x:curve[j],y:curve[j+1]},{x:curve[j+2],y:curve[j+3]},{x:curve[j+4],y:curve[j+5]}]})
      }
    }else{
      lineRun++
      if(lineRun>=12){segments.push({kind:'C',points:[previous,point,point]});lineRun=1}
      else segments.push({kind:'L',points:[point]})
    }
  }
  const all=segments.flatMap(segment=>segment.points),x=Math.min(...all.map(p=>p.x)),y=Math.min(...all.map(p=>p.y)),right=Math.max(...all.map(p=>p.x)),bottom=Math.max(...all.map(p=>p.y))
  for(const precision of [3,2,1]){
    const round=(value:number)=>Math.round(value*10**precision)/10**precision
    const label=(value:number)=>{const result=round(value).toFixed(precision).replace(/\.?0+$/,'');return result==='-0'?'0':result}
    const d=segments.map(segment=>segment.kind+segment.points.map(point=>label(point.x-x)+' '+label(point.y-y)).join(' ')).join(' ')
    if(!isArtifactPenPath(d))continue
    const w=round(right-x),h=round(bottom-y)
    return w>8000||h>8000?null:{x:Math.round(x*10)/10,y:Math.round(y*10)/10,w:Math.max(2,w),h:Math.max(2,h),d}
  }
  return null
}
