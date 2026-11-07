import type {ArtifactPage} from './artifact-document.js'

export type BoardRect=Pick<ArtifactPage,'x'|'y'|'width'|'height'>
export type BoardHandle='n'|'e'|'s'|'w'|'nw'|'ne'|'se'|'sw'
export interface BoardSnap {axis:'x'|'y';at:number}
interface Anchor {at:number;kind:'edge'|'center'}
const anchors=(start:number,size:number):Anchor[]=>[{at:start,kind:'edge'},{at:start+size/2,kind:'center'},{at:start+size,kind:'edge'}]
function snapAxis(values:Anchor[],targets:Anchor[],tolerance:number):{delta:number;at?:number}{
  let best:{delta:number;at:number;distance:number;kind:Anchor['kind']}|undefined
  for(const target of targets)for(const value of values){
    if(target.kind!==value.kind)continue
    const delta=target.at-value.at,distance=Math.abs(delta)
    if(distance<=tolerance&&(!best||distance<best.distance||distance===best.distance&&target.kind==='center'&&best.kind!=='center'))best={delta,at:target.at,distance,kind:target.kind}
  }
  return best?{delta:best.delta,at:best.at}:{delta:0}
}
function targetAxes(others:BoardRect[]){return{x:others.flatMap(page=>anchors(page.x,page.width)),y:others.flatMap(page=>anchors(page.y,page.height))}}

/** 屏幕八像素内，边对边、中心对中心；相同距离优先中心。 */
export function moveBoardRects(pages:BoardRect[],dx:number,dy:number,others:BoardRect[],scale:number,copy=false):{rects:BoardRect[];guides:BoardSnap[]}{
  if(!pages.length)return{rects:[],guides:[]}
  const left=Math.min(...pages.map(p=>p.x)),top=Math.min(...pages.map(p=>p.y)),width=Math.max(...pages.map(p=>p.x+p.width))-left,height=Math.max(...pages.map(p=>p.y+p.height))-top
  const target=targetAxes(others),x=snapAxis(anchors(left+dx,width),target.x,8/scale),y=snapAxis(anchors(top+dy,height),target.y,8/scale)
  const position=(before:number,delta:number)=>{const next=Math.round(before+delta);return !copy&&next===Math.round(before)?before:next}
  return{rects:pages.map(page=>({x:position(page.x,dx+x.delta),y:position(page.y,dy+y.delta),width:page.width,height:page.height})),guides:[...(x.at===undefined?[]:[{axis:'x' as const,at:x.at}]),...(y.at===undefined?[]:[{axis:'y' as const,at:y.at}])]}
}

export function resizeBoardRect(page:BoardRect,handle:BoardHandle,dx:number,dy:number,others:BoardRect[],scale:number,keepRatio=false):{rect:BoardRect;guides:BoardSnap[]}{
  const west=handle.includes('w'),east=handle.includes('e'),north=handle.includes('n'),south=handle.includes('s'),horizontal=west||east,vertical=north||south
  const target=targetAxes(others),x=horizontal?snapAxis([{at:(west?page.x:page.x+page.width)+dx,kind:'edge'}],target.x,8/scale):{delta:0,at:undefined},y=vertical?snapAxis([{at:(north?page.y:page.y+page.height)+dy,kind:'edge'}],target.y,8/scale):{delta:0,at:undefined}
  // 只舍入手势增量，旧文档的小数位置和未触及的尺寸保持原值。
  const deltaX=Math.round(dx+x.delta),deltaY=Math.round(dy+y.delta),ratio=keepRatio&&horizontal&&vertical
  let width=page.width+(west?-deltaX:east?deltaX:0),height=page.height+(north?-deltaY:south?deltaY:0)
  if(ratio){
    width=Math.max(0,width);height=Math.max(0,height)
    const requested=Math.abs(width/page.width-1)>=Math.abs(height/page.height-1)?width/page.width:height/page.height
    const factor=Math.max(120/page.width,120/page.height,Math.min(requested,8000/page.width,8000/page.height))
    width=page.width*factor;height=page.height*factor
  }else{if(horizontal)width=Math.max(120,Math.min(8000,width));if(vertical)height=Math.max(120,Math.min(8000,height))}
  const rect={x:west?page.x+page.width-width:page.x,y:north?page.y+page.height-height:page.y,width,height}
  if(ratio)for(const key of ['x','y','width','height'] as const)rect[key]=Math.round(rect[key])
  const guides:BoardSnap[]=[]
  if(x.at!==undefined&&Math.abs((west?rect.x:rect.x+rect.width)-x.at)<=.5)guides.push({axis:'x',at:x.at})
  if(y.at!==undefined&&Math.abs((north?rect.y:rect.y+rect.height)-y.at)<=.5)guides.push({axis:'y',at:y.at})
  return{rect,guides}
}
