import type {ArtifactDocument} from '../../../../shared/artifact-document'
import type {VectorDraftPoint} from '../../../../shared/artifact-vector'

export interface VectorStart {document:ArtifactDocument;canvasPageId:string}
export interface VectorDraft {points:VectorDraftPoint[];start:VectorStart;blocked?:boolean}

/** Owned by one editor, so a tool or canvas unmount cannot lose unsaved points. */
export class VectorDraftStore {
  private entries=new Map<string,VectorDraft>()
  private listeners=new Set<()=>void>()
  private version=0
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener)}}
  getSnapshot=()=>this.version
  private changed(){this.version++;for(const listener of this.listeners)listener()}
  get size(){return this.entries.size}
  get blocked(){return [...this.entries.values()].some(draft=>draft.blocked)}
  get(canvasPageId:string){return this.entries.get(canvasPageId)}
  set(canvasPageId:string,draft:VectorDraft){this.entries.set(canvasPageId,draft);this.changed()}
  block(canvasPageId:string){const draft=this.entries.get(canvasPageId);if(draft&&!draft.blocked)this.set(canvasPageId,{...draft,blocked:true})}
  delete(canvasPageId:string){if(this.entries.delete(canvasPageId))this.changed()}
  clear(){if(this.entries.size){this.entries.clear();this.changed()}}
  recovery(){return Object.fromEntries([...this.entries].map(([id,draft])=>[id,{points:draft.points,start:draft.start}]))}
}
