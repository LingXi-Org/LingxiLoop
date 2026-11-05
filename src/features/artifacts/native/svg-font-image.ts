import { createDocument, createNode, createPage, isSafeArtifactSvg } from '../../../../shared/artifact-document'
import { editorFontFamily } from './editor-fonts'
import { presentSvg } from './svg-presentation'
import { ExportResources } from './export/common'
import { offlineDocumentFonts } from './export/fonts'

// Retain only completed small images; requests belong to the visible component.
const images = new Map<string, {url:string;bytes:number}>()
const MAX_ENTRIES=8,MAX_BYTES=4*1024*1024
let retainedBytes=0

/** SVG images cannot inherit the host's webfonts. Pack the same local faces used
 * by exports inside the inert image, while keeping authored SVG immutable. */
export async function svgFontImage(source:string,inherited:string|undefined,signal:AbortSignal):Promise<string> {
  signal.throwIfAborted()
  const key=`${inherited??''}\0${source}`,cached=images.get(key)
  if(cached){images.delete(key);images.set(key,cached);return cached.url}
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
    if(inherited&&!root.hasAttribute('font-family'))root.setAttribute('font-family',editorFontFamily(inherited)??inherited)
    if(css){const style=xml.createElementNS('http://www.w3.org/2000/svg','style');style.textContent=css;root.prepend(style)}
    const url=`data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(root))}`,bytes=2*(key.length+url.length)
    signal.throwIfAborted()
    if(bytes<=MAX_BYTES){
      while(images.size>=MAX_ENTRIES||retainedBytes+bytes>MAX_BYTES){const first=images.keys().next().value!;retainedBytes-=images.get(first)!.bytes;images.delete(first)}
      const previous=images.get(key);if(previous){retainedBytes-=previous.bytes;images.delete(key)}
      images.set(key,{url,bytes});retainedBytes+=bytes
    }
    return url
  }finally{resources.dispose()}
}
