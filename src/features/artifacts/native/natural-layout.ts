import type {ArtifactNode,ArtifactPage} from '../../../../shared/artifact-document'

export interface NaturalNodeSize {width:number;height:number}
export type NaturalNodeSizes=WeakMap<ArtifactNode,NaturalNodeSize>

/** Own only eight page caches; weak node keys never retain old document text. */
export class NaturalLayouts {
  private pages=new Map<string,NaturalNodeSizes>()
  constructor(private maximum=8){}
  forPage(id:string){
    const sizes=this.pages.get(id)??new WeakMap<ArtifactNode,NaturalNodeSize>()
    this.pages.delete(id);this.pages.set(id,sizes)
    while(this.pages.size>this.maximum)this.pages.delete(this.pages.keys().next().value!)
    return sizes
  }
  get size(){return this.pages.size}
}

/** Actual browser geometry is a view, never a passive write to the saved model. */
export function withNaturalLayout(page:ArtifactPage,sizes?:NaturalNodeSizes):ArtifactPage {
  if(!sizes)return page
  let changed=false
  const nodes={...page.nodes}
  for(const id of page.nodeOrder){const node=page.nodes[id]!,size=node.type==='note'?sizes.get(node):undefined
    if(size&&(Math.abs(size.width-node.width)>.001||Math.abs(size.height-node.height)>.001)){nodes[id]={...node,...size};changed=true}
  }
  return changed?{...page,nodes}:page
}
