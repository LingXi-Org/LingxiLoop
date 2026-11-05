import { createDocument, createNode, createPage, isSafeArtifactSvg } from '../../../../shared/artifact-document'
import { editorFontFamily } from './editor-fonts'
import { cachedSvgImage, rememberSvgImage } from './svg-image-cache'
import { presentSvg } from './svg-presentation'
import { ExportResources } from './export/common'
import { offlineDocumentFonts } from './export/fonts'

/** SVG images cannot inherit the host's webfonts. Pack the same local faces used
 * by exports inside the inert image, while keeping authored SVG immutable. */
export async function svgFontImage(source:string,inherited:string|undefined,signal:AbortSignal):Promise<string> {
  signal.throwIfAborted()
  const key=`${inherited??''}\0${source}`,cached=cachedSvgImage(key)
  if(cached)return cached
  if(!isSafeArtifactSvg(source))throw new Error('图形内容无法读取，请检查原始文件。')
  await import('./editor-fonts.css')
  signal.throwIfAborted()
  const document=createDocument('design','svg-image'),page=createPage('page','图形')
  const node={...createNode('svg','svg'),svg:source,style:inherited?{fontFamily:inherited}:{}}
  page.nodes[node.id]=node;page.nodeOrder=[node.id];document.pages[page.id]=page;document.pageOrder=[page.id]
  const resources=new ExportResources(document,{format:'svg',signal})
  try{
    const css=await offlineDocumentFonts(resources)
    signal.throwIfAborted()
    const xml=new DOMParser().parseFromString(presentSvg(source),'image/svg+xml'),root=xml.documentElement
    if(root.localName!=='svg'||xml.querySelector('parsererror'))throw new Error('图形内容无法读取，请检查原始文件。')
    if(!root.hasAttribute('xmlns'))root.setAttribute('xmlns','http://www.w3.org/2000/svg')
    if(inherited&&(!root.hasAttribute('font-family')||/^(?:inherit|unset)$/i.test(root.getAttribute('font-family')!.trim())))root.setAttribute('font-family',editorFontFamily(inherited)??inherited)
    if(css){const style=xml.createElementNS('http://www.w3.org/2000/svg','style');style.textContent=css;root.prepend(style)}
    const url=`data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(root))}`
    signal.throwIfAborted()
    rememberSvgImage(key,url)
    return url
  }finally{resources.dispose()}
}
