import type {ArtifactPage} from './artifact-document.js'

export type BoardRect=Pick<ArtifactPage,'x'|'y'|'width'|'height'>
export type BoardHandle='n'|'e'|'s'|'w'|'nw'|'ne'|'se'|'sw'
export interface BoardSnap {axis:'x'|'y';at:number}
type BoardSize=Pick<BoardRect,'width'|'height'>
interface ResizeRules {min:BoardSize;max:BoardSize;roundDelta:boolean;roundResult:boolean}
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

export function boardBounds(pages:BoardRect[]):BoardRect|undefined{
  if(!pages.length)return
  const x=Math.min(...pages.map(page=>page.x)),y=Math.min(...pages.map(page=>page.y))
  return{x,y,width:Math.max(...pages.map(page=>page.x+page.width))-x,height:Math.max(...pages.map(page=>page.y+page.height))-y}
}

/** 屏幕八像素内，边对边、中心对中心；相同距离优先中心。 */
export function moveBoardRects(pages:BoardRect[],dx:number,dy:number,others:BoardRect[],scale:number,copy=false):{rects:BoardRect[];guides:BoardSnap[]}{
  if(!pages.length)return{rects:[],guides:[]}
  const {x:left,y:top,width,height}=boardBounds(pages)!
  const target=targetAxes(others),x=snapAxis(anchors(left+dx,width),target.x,8/scale),y=snapAxis(anchors(top+dy,height),target.y,8/scale)
  const position=(before:number,delta:number)=>{const next=Math.round(before+delta);return !copy&&next===Math.round(before)?before:next}
  return{rects:pages.map(page=>({x:position(page.x,dx+x.delta),y:position(page.y,dy+y.delta),width:page.width,height:page.height})),guides:[...(x.at===undefined?[]:[{axis:'x' as const,at:x.at}]),...(y.at===undefined?[]:[{axis:'y' as const,at:y.at}])]}
}

export function resizeBoardRect(page:BoardRect,handle:BoardHandle,dx:number,dy:number,others:BoardRect[],scale:number,keepRatio=false):{rect:BoardRect;guides:BoardSnap[]}{
  return resizeFrame(page,handle,dx,dy,others,scale,keepRatio,{min:{width:120,height:120},max:{width:8000,height:8000},roundDelta:true,roundResult:true})
}

function resizeFrame(page:BoardRect,handle:BoardHandle,dx:number,dy:number,others:BoardRect[],scale:number,keepRatio:boolean,rules:ResizeRules):{rect:BoardRect;guides:BoardSnap[]}{
  const west=handle.includes('w'),east=handle.includes('e'),north=handle.includes('n'),south=handle.includes('s'),horizontal=west||east,vertical=north||south
  const target=targetAxes(others),x=horizontal?snapAxis([{at:(west?page.x:page.x+page.width)+dx,kind:'edge'}],target.x,8/scale):{delta:0,at:undefined},y=vertical?snapAxis([{at:(north?page.y:page.y+page.height)+dy,kind:'edge'}],target.y,8/scale):{delta:0,at:undefined}
  // 只舍入手势增量，旧文档的小数位置和未触及的尺寸保持原值。
  const deltaX=rules.roundDelta?Math.round(dx+x.delta):dx+x.delta,deltaY=rules.roundDelta?Math.round(dy+y.delta):dy+y.delta,ratio=keepRatio&&horizontal&&vertical
  let width=page.width+(west?-deltaX:east?deltaX:0),height=page.height+(north?-deltaY:south?deltaY:0)
  if(ratio){
    width=Math.max(0,width);height=Math.max(0,height)
    const requested=Math.abs(width/page.width-1)>=Math.abs(height/page.height-1)?width/page.width:height/page.height
    const factor=Math.max(rules.min.width/page.width,rules.min.height/page.height,Math.min(requested,rules.max.width/page.width,rules.max.height/page.height))
    width=page.width*factor;height=page.height*factor
  }else{if(horizontal)width=Math.max(rules.min.width,Math.min(rules.max.width,width));if(vertical)height=Math.max(rules.min.height,Math.min(rules.max.height,height))}
  const rect={x:west?page.x+(page.width-width):page.x,y:north?page.y+(page.height-height):page.y,width,height}
  if(ratio&&rules.roundResult)for(const key of ['x','y','width','height'] as const)rect[key]=Math.round(rect[key])
  const guides:BoardSnap[]=[]
  if(x.at!==undefined&&Math.abs((west?rect.x:rect.x+rect.width)-x.at)<=.5)guides.push({axis:'x',at:x.at})
  if(y.at!==undefined&&Math.abs((north?rect.y:rect.y+rect.height)-y.at)<=.5)guides.push({axis:'y',at:y.at})
  return{rect,guides}
}

/** 整组以统一外框缩放，各成员仅更新触及的轴；旧的越界尺寸不被强制归一化。 */
export function resizeBoardSelection(pages:Array<BoardRect&{frameless?:boolean}>,handle:BoardHandle,dx:number,dy:number,others:BoardRect[],scale:number,keepRatio=false):{rect:BoardRect;rects:BoardRect[];guides:BoardSnap[]}{
  const before=boardBounds(pages)
  if(!before)return{rect:{x:0,y:0,width:0,height:0},rects:[],guides:[]}
  const minRatio:BoardSize={width:0,height:0},maxRatio:BoardSize={width:Infinity,height:Infinity}
  for(const page of pages)if(!page.frameless)for(const key of ['width','height'] as const){
    if(page[key]>=120)minRatio[key]=Math.max(minRatio[key],120/page[key])
    if(page[key]<=8000)maxRatio[key]=Math.min(maxRatio[key],8000/page[key])
  }
  const min={width:Math.max(before.width*minRatio.width,Math.min(8,before.width)),height:Math.max(before.height*minRatio.height,Math.min(8,before.height))},max={width:before.width*maxRatio.width,height:before.height*maxRatio.height}
  const result=resizeFrame(before,handle,dx,dy,others,scale,keepRatio,{min,max,roundDelta:false,roundResult:false})
  const horizontal=handle.includes('e')||handle.includes('w'),vertical=handle.includes('n')||handle.includes('s')
  const ratioX=result.rect.width/before.width,ratioY=result.rect.height/before.height
  const preserve=(previous:number,value:number)=>Math.round(previous)===Math.round(value)?previous:Math.round(value)
  const dimension=(previous:number,value:number)=>preserve(previous,Math.min(Math.max(8000,previous),Math.max(Math.min(120,previous),value)))
  const rects=pages.map(page=>({
    x:horizontal?preserve(page.x,result.rect.x+(page.x-before.x)*ratioX):page.x,
    y:vertical?preserve(page.y,result.rect.y+(page.y-before.y)*ratioY):page.y,
    width:horizontal&&!page.frameless?dimension(page.width,page.width*ratioX):page.width,
    height:vertical&&!page.frameless?dimension(page.height,page.height*ratioY):page.height,
  }))
  return{...result,rects}
}
