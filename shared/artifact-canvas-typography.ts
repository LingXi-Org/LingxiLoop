import {createNode,type ArtifactNode,type ArtifactStyle} from './artifact-document.js'

/** Source v2.8.0 canvas text metrics, independent from board text defaults. */
export function canvasTextMetrics(size:number){
  const lineHeight=Math.max(1.1,Math.min(1.45,1.45-(size-14)*.006)),paddingX=Math.round(12+(size-14)*.2),paddingY=Math.round(10+(size-14)*.11)
  return{lineHeight,paddingX,paddingY,letterSpacing:size>=64?-.02*size:size>=36?-.01*size:0,minHeight:Math.round(size*lineHeight)+2*paddingY}
}
export function createCanvasText(id:string,type:'text'|'note'):ArtifactNode {
  const title=type==='text',size=title?24:14,{minHeight,...metrics}=canvasTextMetrics(size)
  return{...createNode(type,id),text:'',width:title?2000:240,height:minHeight,...(title?{textSizing:'content' as const}:{}),style:{fontFamily:'system-ui',fontSize:size,fontWeight:400,...metrics,...(title?{}:{fill:'#fef3a2',color:'#4a4220',borderRadius:2})}}
}
/** Size changes follow source metrics; explicit custom values remain explicit. */
export function canvasFontPatch(node:ArtifactNode,patch:ArtifactStyle):ArtifactStyle {
  if(patch.fontSize===undefined)return patch
  const before=canvasTextMetrics(node.style.fontSize??(node.type==='note'?14:24)),after=canvasTextMetrics(patch.fontSize),result={...patch}
  for(const key of ['lineHeight','paddingX','paddingY','letterSpacing'] as const){
    if((key==='paddingX'||key==='paddingY')&&node.style.padding!==undefined)continue
    if(patch[key]===undefined&&(node.style[key]===undefined||Math.abs(node.style[key]!-before[key])<.00001))result[key]=after[key]
  }
  return result
}
