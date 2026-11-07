import {compositeContrastColor,parseContrastColor,textContrastMinimum,textContrastRatio,type ContrastColor} from './text-contrast'

export interface RenderedTextContrast{foreground:string;background:string;ratio:number;passed:boolean}
// Read the rendered cascade, including authored CSS and theme colors. A gradient,
// image, compositing effect or overlapping paint has no single known ground.
export function renderedTextContrast(element:HTMLElement,scope:HTMLElement):RenderedTextContrast|null{
 const inkStyle=getComputedStyle(element),foreground=inkStyle.webkitTextFillColor||inkStyle.color,ink=parseContrastColor(foreground)
 if(!ink||ink.a===0||inkStyle.backgroundClip==='text'||inkStyle.webkitBackgroundClip==='text')return null
 let base:ContrastColor|null=null
 const layers:ContrastColor[]=[],painted:HTMLElement[]=[]
 for(let ancestor:HTMLElement|null=element;ancestor;ancestor=ancestor.parentElement){
  const style=getComputedStyle(ancestor)
  if(Number(style.opacity)<1||style.filter!=='none'||style.mixBlendMode!=='normal'||style.maskImage!=='none')return null
  if(!base){
   if(style.backgroundImage!=='none'||style.backdropFilter!=='none')return null
   const color=parseContrastColor(style.backgroundColor)
   if(!color)return null
   if(color.a>=.98){base={...color,a:1};painted.push(ancestor)}
   else if(color.a>.02){layers.push(color);painted.push(ancestor)}
  }
  if(ancestor===scope)break
 }
 if(!base)return null
 for(const color of layers.reverse())base=compositeContrastColor(color,base)
 base={r:Math.round(base.r),g:Math.round(base.g),b:Math.round(base.b),a:1}
 const rect=element.getBoundingClientRect()
 if(!rect.width||!rect.height)return null
 const points=[rect.left+rect.width/2,rect.left+Math.min(4,rect.width/4)]
 for(const x of points){
  const hits=element.ownerDocument.elementsFromPoint(x,rect.top+rect.height/2)
  if(!hits.some(hit=>hit===element||element.contains(hit)))return null
  for(const hit of hits){
   if(hit===painted[painted.length-1])break
   if(hit===element||element.contains(hit)||hit.contains(element))continue
   if(!scope.contains(hit)||hit.closest('.native-selection,.native-board-group-selection,.native-board-member-selection'))continue
   // The document paint stack, rather than the editor chrome, determines ground.
   if(hit.closest('[data-node-id]')||hit.closest('[data-page-id]'))return null
  }
  if(painted.some(ancestor=>!hits.includes(ancestor)))return null
 }
 const ratio=textContrastRatio(ink,base),minimum=textContrastMinimum(parseFloat(inkStyle.fontSize),parseFloat(inkStyle.fontWeight))
 return{foreground,background:`rgb(${base.r}, ${base.g}, ${base.b})`,ratio,passed:ratio+1e-9>=minimum}
}
