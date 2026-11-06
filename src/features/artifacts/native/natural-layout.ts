import type {ArtifactDocument,ArtifactNode,ArtifactPage,ArtifactStyle} from '../../../../shared/artifact-document'
import {artifactResolvedStyle} from '../../../../shared/artifact-themes'

export interface NaturalNodeSize {width:number;height:number}
const signature=(node:ArtifactNode,style:ArtifactStyle)=>JSON.stringify([node.width,node.text,node.richText,style])

/** Exact layout dependencies survive the reducer's whole-page structuredClone.
 * Each page retains at most 256 measurements and 512 KiB of dependency strings. */
export class NaturalNodeSizes {
  private entries=new Map<string,{signature:string;size:NaturalNodeSize}>()
  private characters=0
  get(node:ArtifactNode,style:ArtifactStyle=node.style){
    const entry=this.entries.get(node.id)
    if(!entry||entry.signature!==signature(node,style))return undefined
    this.entries.delete(node.id);this.entries.set(node.id,entry)
    return entry.size
  }
  set(node:ArtifactNode,size:NaturalNodeSize,style:ArtifactStyle=node.style){
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
  for(const id of page.nodeOrder){const node=page.nodes[id]!,size=node.type==='note'?sizes.get(node,document?artifactResolvedStyle(node.style,document):node.style):undefined
    if(size&&(Math.abs(size.width-node.width)>.001||Math.abs(size.height-node.height)>.001)){nodes[id]={...node,...size};changed=true}
  }
  return changed?{...page,nodes}:page
}
