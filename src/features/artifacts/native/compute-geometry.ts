import {validateNodeBounds} from './compute-bulk'
import type { Bounds, Point, Rect, ElementProjection, ElementGeometry } from './compute-protocol'

/** Geometry contains only compact rectangles, never document/node payloads. */
export class BoundsIndex {
  private bounds = new Map<string, Bounds>()

  replace(bounds: readonly Bounds[]) {
    this.bounds.clear()
    this.update(bounds, [])
  }

  update(upserts: readonly Bounds[], removed: readonly string[]) {
    for (const id of removed) this.bounds.delete(id)
    for (const bounds of upserts) {
      if ([bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
        && bounds.width >= 0 && bounds.height >= 0) this.bounds.set(bounds.id, bounds)
    }
  }

  visible(viewport: Rect) {
    const result: string[] = []
    for (const bounds of this.bounds.values()) {
      if (bounds.x + bounds.width >= viewport.x && bounds.y + bounds.height >= viewport.y
        && bounds.x <= viewport.x + viewport.width && bounds.y <= viewport.y + viewport.height) result.push(bounds.id)
    }
    return result
  }

  snap(point: Point, tolerance: number): Point {
    let dx = Math.max(0, tolerance), dy = dx
    const result = { ...point }
    for (const bounds of this.bounds.values()) {
      for (const x of [bounds.x, bounds.x + bounds.width / 2, bounds.x + bounds.width]) {
        if (Math.abs(point.x - x) < dx) { dx = Math.abs(point.x - x); result.x = x }
      }
      for (const y of [bounds.y, bounds.y + bounds.height / 2, bounds.y + bounds.height]) {
        if (Math.abs(point.y - y) < dy) { dy = Math.abs(point.y - y); result.y = y }
      }
    }
    return result
  }
}

/** Per-page element rectangles are retained only while useful to the viewport. */
export class ElementIndexes {
  private pages=new Map<string,{revision:number;geometryKey:number;index:BoundsIndex;issues:ElementProjection['issues']}>()

  /** Index, validate and query together so LRU eviction cannot interrupt a page query. */
  project(pageId:string,geometry:ElementGeometry,viewport:Rect,revision:number,geometryKey:number):ElementProjection{
    const previous=this.pages.get(pageId)
    if(previous&&revision<previous.revision)throw new Error('stale_index')
    let entry=previous
    if(!entry||entry.geometryKey!==geometryKey){
      const elements=geometry.ids.map((id,i)=>({id,x:geometry.coordinates[i*4],y:geometry.coordinates[i*4+1],width:geometry.coordinates[i*4+2],height:geometry.coordinates[i*4+3]}))
      entry={revision,geometryKey,index:new BoundsIndex(),issues:validateNodeBounds(elements)}
      entry.index.replace(elements)
    }
    entry.revision=revision
    this.pages.delete(pageId);this.pages.set(pageId,entry)
    while(this.pages.size>8)this.pages.delete(this.pages.keys().next().value!)
    return{ids:entry.index.visible(viewport),issues:entry.issues}
  }
  drop(pageId:string){this.pages.delete(pageId)}
  get size(){return this.pages.size}
}
