import type {ArtifactDocument,ArtifactPage} from './artifact-document.js'
import {artifactResolvedStyle} from './artifact-themes.js'

/** baoyu-design v2.8.0字体菜单的只读声明摘要；来源与许可见THIRD_PARTY_NOTICES.md。 */
export interface PageFontFamilies{first:string[];display:string[]}
export type FontFamilyCensus=Record<string,PageFontFamilies>
const generic=/^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace|ui-rounded|emoji|math|fangsong|-apple-system|BlinkMacSystemFont)$/i
const nonText=/^(inherit|initial|unset|revert|revert-layer|default)$|emoji|symbol|icons\b|\bicon\b/i
const plain=/^(?![^]*[\u115f\u1160\u3164\uffa0])[\p{L}\p{N}_.-]+(?:'[\p{L}\p{N}_.-]+)*(?: [\p{L}\p{N}_.-]+(?:'[\p{L}\p{N}_.-]+)*)*$/u
export function displayFontFamily(raw:string):string{
 const families=raw.replace(/\s*!\s*important\s*$/i,'').split(',').map(value=>value.trim().replace(/^["']|["']$/g,'')).filter(Boolean)
 return families.find(value=>!generic.test(value)&&!/emoji|symbol/i.test(value))??families[0]??''
}
export function pageFontFamilies(page:ArtifactPage,document:ArtifactDocument):PageFontFamilies{
 const children=new Map<string|null,string[]>()
 for(const id of page.nodeOrder){const node=page.nodes[id];if(node){const siblings=children.get(node.parentId)??[];siblings.push(id);children.set(node.parentId,siblings)}}
 const first=new Set<string>(),display=new Set<string>()
 const visit=(id:string)=>{
  const node=page.nodes[id],raw=node.css?.['font-family']??artifactResolvedStyle(node.style,document).fontFamily
  if(raw){const value=raw.split(',')[0].trim().replace(/['"]/g,'');if(value&&!value.includes('{{'))first.add(value);const name=displayFontFamily(raw);if(plain.test(name)&&!generic.test(name)&&!nonText.test(name))display.add(name)}
  for(const child of children.get(id)??[])visit(child)
 }
 for(const id of children.get(null)??[])visit(id)
 return{first:[...first],display:[...display]}
}
export function artifactFontFamilyCensus(document:ArtifactDocument):FontFamilyCensus{
 return Object.fromEntries(document.pageOrder.map(id=>[id,pageFontFamilies(document.pages[id],document)]))
}
export function documentFontFamilies(document:ArtifactDocument,currentId:string,census:FontFamilyCensus|undefined,loadedIds:readonly string[]):string[]{
 const loaded=new Set(loadedIds),pages=new Map(document.pageOrder.map(id=>[id,loaded.has(id)||!census?.[id]?pageFontFamilies(document.pages[id],document):census[id]])),names=new Map<string,string>()
 for(const name of [...(pages.get(currentId)?.first??[]),...[...pages.values()].flatMap(page=>page.display)])if(!names.has(name.toLowerCase()))names.set(name.toLowerCase(),name)
 return[...names.values()]
}
