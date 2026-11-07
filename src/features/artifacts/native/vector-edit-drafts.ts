import type {ArtifactDocument} from '../../../../shared/artifact-document'
import type {EditableVector} from '../../../../shared/artifact-vector-edit'
import type {RenderedNodeFrame} from './rendered-geometry'

export interface VectorEditBase {document:ArtifactDocument;frame:RenderedNodeFrame}
export interface VectorEditDraft extends VectorEditBase {pageId:string;nodeId:string;path:EditableVector;blocked?:boolean}

/** Failed point edits outlive their overlay and retain their original CAS base. */
export class VectorEditDraftStore {
  private entries=new Map<string,VectorEditDraft>()
  private listeners=new Set<()=>void>()
  private version=0
  private key(pageId:string,nodeId:string){return JSON.stringify([pageId,nodeId])}
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener)}}
  getSnapshot=()=>this.version
  private changed(){this.version++;for(const listener of this.listeners)listener()}
  get size(){return this.entries.size}
  get blocked(){return [...this.entries.values()].some(draft=>draft.blocked)}
  get(pageId:string,nodeId:string){return this.entries.get(this.key(pageId,nodeId))}
  set(draft:VectorEditDraft){this.entries.set(this.key(draft.pageId,draft.nodeId),draft);this.changed()}
  block(pageId:string,nodeId:string){const draft=this.get(pageId,nodeId);if(draft&&!draft.blocked)this.set({...draft,blocked:true})}
  delete(pageId:string,nodeId:string){if(this.entries.delete(this.key(pageId,nodeId)))this.changed()}
  clear(){if(this.entries.size){this.entries.clear();this.changed()}}
  recovery(){return [...this.entries.values()].map(({blocked:_,...draft})=>draft)}
}
