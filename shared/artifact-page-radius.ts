import type {ArtifactPage} from './artifact-document.js'

type Radius=ArtifactPage['radius']
/** CSS order: top left, top right, bottom right, bottom left. */
export function pageRadiusCorners(radius:Radius):[number,number,number,number]{
  return typeof radius==='number'?[radius,radius,radius,radius]:radius?[...radius] as [number,number,number,number]:[0,0,0,0]
}
export function normalizePageRadius(value:unknown):Radius{
  if(value===undefined)return
  const values=Array.isArray(value)?value:[value,value,value,value]
  if(values.length!==4||values.some(v=>typeof v!=='number'||!Number.isFinite(v)))return
  const corners=values.map(v=>Math.max(0,Math.min(4000,Math.round(v*100)/100))) as [number,number,number,number]
  return corners.every(v=>v===corners[0])?corners[0]||undefined:corners
}
export function pageRadiusCss(radius:Radius):string|undefined{
  const value=normalizePageRadius(radius)
  return value===undefined?undefined:(typeof value==='number'?[value]:value).map(v=>`${v}px`).join(' ')
}

/** SVG previews use the same proportional corner reduction as CSS border-radius. */
export function pageRadiusPath(radius:Radius,width:number,height:number):string{
  const values=pageRadiusCorners(normalizePageRadius(radius)),[tl,tr,br,bl]=values
  const factor=Math.min(1,...[[width,tl+tr],[height,tr+br],[width,br+bl],[height,bl+tl]].map(([size,sum])=>sum?size/sum:1))
  const [a,b,c,d]=values.map(value=>value*factor)
  return `M${a} 0 H${width-b} A${b} ${b} 0 0 1 ${width} ${b} V${height-c} A${c} ${c} 0 0 1 ${width-c} ${height} H${d} A${d} ${d} 0 0 1 0 ${height-d} V${a} A${a} ${a} 0 0 1 ${a} 0 Z`
}
