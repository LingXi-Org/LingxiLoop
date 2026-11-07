import type {BoardRect} from './artifact-board-transform.js'

export interface BoardGap {axis:'x'|'y';from:number;to:number;at:number;label:string}
interface Candidate {delta:number;between:boolean;gaps:BoardGap[]}

/** 等距只参考横向投影有交集的对象；包含当前对象的最近容器限定候选范围。 */
export function equalBoardGaps(moving:BoardRect,others:BoardRect[],tolerance:number,aligned={x:0,y:0}):{dx:number;dy:number;gaps:BoardGap[]}{
  const result={dx:0,dy:0,gaps:[] as BoardGap[]}
  for(const axis of ['x','y'] as const){
    const size=axis==='x'?'width':'height',cross=axis==='x'?'y':'x',crossSize=axis==='x'?'height':'width'
    const start=(rect:BoardRect)=>rect[axis],end=(rect:BoardRect)=>rect[axis]+rect[size]
    const crossStart=moving[cross]+aligned[cross],crossEnd=crossStart+moving[crossSize],length=moving[size]
    const overlaps=others.filter(rect=>rect[cross]<crossEnd&&rect[cross]+rect[crossSize]>crossStart)
    const contains=(rect:BoardRect)=>start(rect)<=start(moving)&&end(rect)>=end(moving)
    const container=overlaps.filter(contains).reduce<BoardRect|undefined>((best,rect)=>!best||rect[size]<best[size]?rect:best,undefined)
    const candidates=overlaps.filter(rect=>!contains(rect)&&(!container||start(rect)>=start(container)&&end(rect)<=end(container)))
    const center=start(moving)+length/2,left=candidates.filter(rect=>start(rect)+rect[size]/2<center),right=candidates.filter(rect=>start(rect)+rect[size]/2>=center)
    const last=(rects:BoardRect[])=>rects.reduce<BoardRect|undefined>((best,rect)=>!best||end(rect)>end(best)?rect:best,undefined)
    const first=(rects:BoardRect[])=>rects.reduce<BoardRect|undefined>((best,rect)=>!best||start(rect)<start(best)?rect:best,undefined)
    const before=last(left),after=first(right)
    const preceding=before&&last(left.filter(rect=>rect!==before&&end(rect)<=start(before)))
    const following=after&&first(right.filter(rect=>rect!==after&&start(rect)>=end(after)))
    const crossMiddle=(a?:BoardRect,b?:BoardRect)=>{
      const low=Math.max(a?a[cross]:crossStart,b?b[cross]:crossStart),high=Math.min(a?a[cross]+a[crossSize]:crossEnd,b?b[cross]+b[crossSize]:crossEnd)
      return low<=high?(low+high)/2:(crossStart+crossEnd)/2
    }
    const gap=(from:number,to:number,at:number,label=String(Math.round(to-from))):BoardGap=>({axis,from,to,at,label})
    const free=(from:number,to:number)=>!candidates.some(rect=>start(rect)<to&&end(rect)>from&&!(start(rect)<=from&&end(rect)>=to))
    const choices:Candidate[]=[]
    if(before&&after){
      const target=Math.round(end(before)+(start(after)-end(before)-length)/2)
      if(Math.round(target-end(before))>=1&&Math.round(start(after)-target-length)>=1)choices.push({delta:target-start(moving),between:true,gaps:[gap(end(before),target,crossMiddle(before)),gap(target+length,start(after),crossMiddle(undefined,after))]})
    }
    if(before&&preceding&&free(end(preceding),start(before))){
      const distance=start(before)-end(preceding),target=Math.round(end(before)+distance)
      if(Math.round(distance)>=1&&Math.round(target-end(before))>=1){const previous=gap(end(preceding),start(before),crossMiddle(preceding,before));choices.push({delta:target-start(moving),between:false,gaps:[previous,gap(end(before),target,crossMiddle(before),previous.label)]})}
    }
    if(after&&following&&free(end(after),start(following))){
      const distance=start(following)-end(after),target=Math.round(start(after)-distance-length)
      if(Math.round(distance)>=1&&Math.round(start(after)-target-length)>=1){const next=gap(end(after),start(following),crossMiddle(after,following));choices.push({delta:target-start(moving),between:false,gaps:[gap(target+length,start(after),crossMiddle(undefined,after),next.label),next]})}
    }
    let chosen:Candidate|undefined
    for(const choice of choices){
      const distance=Math.abs(choice.delta),previous=chosen?Math.abs(chosen.delta):Infinity
      if(distance<=tolerance&&(!chosen||distance<previous-.5||Math.abs(distance-previous)<=.5&&choice.between&&!chosen.between))chosen=choice
    }
    if(chosen){if(axis==='x')result.dx=chosen.delta;else result.dy=chosen.delta;result.gaps.push(...chosen.gaps)}
  }
  return result
}
