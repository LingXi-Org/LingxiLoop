import type {ArtifactDocument,ArtifactNode,ArtifactPage,ArtifactStyle} from '../../../../shared/artifact-document'
import {artifactResolvedStyle} from '../../../../shared/artifact-themes'

const inheritedTypography=['fontFamily','fontWeight','fontStyle','letterSpacing','textAlign','textDecoration'] as const
/** Native nodes always set their own size/line height; these properties inherit through groups. */
export function naturalNodeStyle(page:ArtifactPage,node:ArtifactNode,document?:ArtifactDocument):ArtifactStyle {
  const resolve=(source:ArtifactNode)=>document?artifactResolvedStyle(source.style,document):{...source.style}
  const style=resolve(node),seen=new Set<string>()
  let parentId=node.parentId
  while(parentId&&!seen.has(parentId)){
    seen.add(parentId)
    const parent=page.nodes[parentId];if(!parent)break
    const inherited=resolve(parent)
    for(const key of inheritedTypography)if(style[key]===undefined&&inherited[key]!==undefined)Object.assign(style,{[key]:inherited[key]})
    parentId=parent.parentId
  }
  return style
}

export interface NaturalNodeSize {width:number;height:number}
const signature=(node:ArtifactNode,style:ArtifactStyle)=>JSON.stringify([node.width,node.text,node.richText,style])

/** Exact layout dependencies survive the reducer's whole-page structuredClone.
 * Each page retains at most 256 measurements and 512 KiB of dependency strings. */
export class NaturalNodeSizes {
  private entries=new Map<string,{signature:string;size:NaturalNodeSize}>()
  private characters=0
  private current=new WeakMap<ArtifactNode,{style:string;size:NaturalNodeSize}>()
  get(node:ArtifactNode,style:ArtifactStyle=node.style){
    const styleKey=JSON.stringify(style),current=this.current.get(node)
    if(current?.style===styleKey)return current.size
    const entry=this.entries.get(node.id)
    if(!entry||entry.signature!==signature(node,style))return undefined
    this.entries.delete(node.id);this.entries.set(node.id,entry)
    this.current.set(node,{style:styleKey,size:entry.size})
    return entry.size
  }
  set(node:ArtifactNode,size:NaturalNodeSize,style:ArtifactStyle=node.style){
    this.current.set(node,{style:JSON.stringify(style),size})
    const key=signature(node,style),old=this.entries.get(node.id)
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
  for(const id of page.nodeOrder){const node=page.nodes[id]!,size=node.type==='note'?sizes.get(node,naturalNodeStyle(page,node,document)):undefined
    if(size&&(Math.abs(size.width-node.width)>.001||Math.abs(size.height-node.height)>.001)){nodes[id]={...node,...size};changed=true}
  }
  return changed?{...page,nodes}:page
}

/** Bounded DOM probes recover measured geometry after normal cache eviction. */
export function naturalMeasurementBatch(page:ArtifactPage|undefined,sizes:NaturalNodeSizes|undefined,document:ArtifactDocument|undefined):ArtifactNode[]{
  if(!page||!sizes||!document)return []
  const batch:ArtifactNode[]=[]
  for(const id of page.nodeOrder){const node=page.nodes[id]!
    if(node.type==='note'&&!node.hidden&&!sizes.get(node,naturalNodeStyle(page,node,document)))batch.push(node)
    if(batch.length===8)break
  }
  return batch
}
