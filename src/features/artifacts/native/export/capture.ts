import type { ArtifactStyle } from '../../../../../shared/artifact-document'

/** Capture overflow ink without stretching the authored object. Symmetric bleed
 * keeps the rotation/flip center unchanged when placed back into the slide. */
export async function captureWithBleed(page: HTMLElement, element: HTMLElement, styles: ArtifactStyle[]) {
  const { toPng } = await import('html-to-image')
  const padding=Math.ceil(Math.max(2,...styles.map(style=>Math.max(
    (style.strokeWidth??0)*5,
    style.shadow ? Math.max(Math.abs(style.shadow.x),Math.abs(style.shadow.y))+2*style.shadow.blur+Math.max(0,style.shadow.spread) : 0,
  ))))
  const wrapper=document.createElement('div'),clone=element.cloneNode(true) as HTMLElement
  const width=element.offsetWidth,height=element.offsetHeight
  Object.assign(wrapper.style,{position:'absolute',left:'0',top:'0',width:`${width+2*padding}px`,height:`${height+2*padding}px`,pointerEvents:'none'})
  Object.assign(clone.style,{position:'absolute',left:`${padding}px`,top:`${padding}px`,width:`${width}px`,height:`${height}px`,transform:'none',margin:'0'})
  wrapper.append(clone);page.append(wrapper)
  try { return {data:await toPng(wrapper,{pixelRatio:2,skipAutoScale:true}),padding} }
  finally { wrapper.remove() }
}
