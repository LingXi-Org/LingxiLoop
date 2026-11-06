import type {ArtifactDocument,ArtifactNode,ArtifactPage,ArtifactStyle} from '../../../../shared/artifact-document'
import {artifactResolvedStyle} from '../../../../shared/artifact-themes'

const inheritedTypography=['fontFamily','fontWeight','fontStyle','letterSpacing','textAlign','textDecoration'] as const
/** Native nodes always set their own size/line height; these properties inherit through groups. */
export function naturalNodeStyle(page:ArtifactPage,node:ArtifactNode,document?:ArtifactDocument):ArtifactStyle {
  const resolve=(source:ArtifactNode)=>document?artifactResolvedStyle(source.style,document):{...source.style}
  const needsFamily=(value:unknown)=>value===undefined||typeof value==='string'&&/^(?:inherit|unset|revert|revert-layer)?$/i.test(value.trim())
  const style=resolve(node),seen=new Set<string>()
  if(needsFamily(style.fontFamily))delete style.fontFamily
  let parentId=node.parentId
  while(parentId&&!seen.has(parentId)){
    seen.add(parentId)
    const parent=page.nodes[parentId];if(!parent)break
    const inherited=resolve(parent)
    for(const key of inheritedTypography)if(style[key]===undefined&&inherited[key]!==undefined&&(key!=='fontFamily'||!needsFamily(inherited[key])))Object.assign(style,{[key]:inherited[key]})
    parentId=parent.parentId
  }
  return style
}

export const isNaturalText=(node:ArtifactNode)=>node.type==='note'||node.type==='text'&&node.textSizing==='content'
export const isFlowChild=(page:ArtifactPage,node:ArtifactNode)=>!!node.parentId&&['flex','grid'].includes(page.nodes[node.parentId]?.layout?.mode??'')
export function hasFlowAncestor(page:ArtifactPage,node:ArtifactNode){
  const seen=new Set<string>();let parentId=node.parentId
  while(parentId&&!seen.has(parentId)){seen.add(parentId);const parent=page.nodes[parentId];if(!parent)break;if(parent.layout?.mode==='flex'||parent.layout?.mode==='grid')return true;parentId=parent.parentId}
  return false
}
export const layoutRevision=(node:ArtifactNode,document?:ArtifactDocument)=>node.parentId?document?.seq??0:undefined

export interface NaturalNodeSize {width:number;height:number;x?:number;y?:number}
const signature=(node:ArtifactNode,style:ArtifactStyle,layout?:number)=>JSON.stringify([node.width,node.textSizing,node.text,node.richText,style,layout])

/** Exact layout dependencies survive the reducer's whole-page structuredClone.
 * Each page retains at most 256 measurements and 512 KiB of dependency strings. */
export class NaturalNodeSizes {
  private entries=new Map<string,{signature:string;size:NaturalNodeSize}>()
  private characters=0
  private current=new WeakMap<ArtifactNode,{style:string;size:NaturalNodeSize}>()
  get(node:ArtifactNode,style:ArtifactStyle=node.style,layout?:number){
    const styleKey=JSON.stringify([style,layout]),current=this.current.get(node)
    if(current?.style===styleKey)return current.size
    const entry=this.entries.get(node.id)
    if(!entry||entry.signature!==signature(node,style,layout))return undefined
    this.entries.delete(node.id);this.entries.set(node.id,entry)
    this.current.set(node,{style:styleKey,size:entry.size})
    return entry.size
  }
  set(node:ArtifactNode,size:NaturalNodeSize,style:ArtifactStyle=node.style,layout?:number){
    this.current.set(node,{style:JSON.stringify([style,layout]),size})
    const key=signature(node,style,layout),old=this.entries.get(node.id)
    if(old){this.characters-=old.signature.length;this.entries.delete(node.id)}
    if(key.length>262144)return
    this.entries.set(node.id,{signature:key,size});this.characters+=key.length
    while(this.entries.size>256||this.characters>262144){const first=this.entries.entries().next().value!;this.characters-=first[1].signature.length;this.entries.delete(first[0])}
  }
  get size(){return this.entries.size}
  get dependencyCharacters(){return this.characters}
}

/** Eight page caches bound retained dependency text to four MiB in total. */
export class NaturalLayouts {
  private pages=new Map<string,NaturalNodeSizes>()
  forPage(id:string){
    const sizes=this.pages.get(id)??new NaturalNodeSizes()
    this.pages.delete(id);this.pages.set(id,sizes)
    while(this.pages.size>8)this.pages.delete(this.pages.keys().next().value!)
    return sizes
  }
  get size(){return this.pages.size}
}

/** Actual browser geometry is a view, never a passive write to the saved model. */
export function withNaturalLayout(page:ArtifactPage,sizes?:NaturalNodeSizes,document?:ArtifactDocument):ArtifactPage {
  if(!sizes)return page
  let changed=false
  const nodes={...page.nodes}
  for(const id of page.nodeOrder){const node=page.nodes[id]!,size=isNaturalText(node)||isFlowChild(page,node)?sizes.get(node,naturalNodeStyle(page,node,document),layoutRevision(node,document)):undefined
    if(size&&(Math.abs(size.width-node.width)>.001||Math.abs(size.height-node.height)>.001||size.x!==undefined&&Math.abs(size.x-node.x)>.001||size.y!==undefined&&Math.abs(size.y-node.y)>.001)){nodes[id]={...node,...size};changed=true}
  }
  return changed?{...page,nodes}:page
}

/** Bounded DOM probes recover measured geometry after normal cache eviction. */
export function naturalMeasurementBatch(page:ArtifactPage|undefined,sizes:NaturalNodeSizes|undefined,document:ArtifactDocument|undefined):ArtifactNode[]{
  if(!page||!sizes||!document)return []
  const batch:ArtifactNode[]=[]
  for(const id of page.nodeOrder){const node=page.nodes[id]!
    if((isNaturalText(node)||isFlowChild(page,node))&&!node.hidden&&!sizes.get(node,naturalNodeStyle(page,node,document),layoutRevision(node,document))){if(hasFlowAncestor(page,node))return[node];batch.push(node)}
    if(batch.length===8)break
  }
  return batch
}
