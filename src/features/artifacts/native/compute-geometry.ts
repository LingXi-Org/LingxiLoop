import type { Bounds, Point, Rect } from './compute-protocol'

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
  private pages = new Map<string, { revision: number; index: BoundsIndex }>()

  replace(pageId: string, elements: readonly Bounds[], revision: number) {
    const existing = this.pages.get(pageId)
    if (existing && revision < existing.revision) throw new Error('stale_index')
    const index = existing?.index ?? new BoundsIndex()
    index.replace(elements)
    this.pages.delete(pageId)
    this.pages.set(pageId, { revision, index })
    while (this.pages.size > 8) this.pages.delete(this.pages.keys().next().value!)
  }

  update(pageId: string, upserts: readonly Bounds[], removed: readonly string[], revision: number) {
    const page = this.pages.get(pageId)
    if (!page) throw new Error('missing_index')
    if (revision < page.revision) throw new Error('stale_index')
    page.index.update(upserts, removed)
    page.revision = revision
    this.pages.delete(pageId)
    this.pages.set(pageId, page)
  }

  visible(pageId: string, viewport: Rect, revision: number) {
    const page = this.pages.get(pageId)
    if (!page) throw new Error('missing_index')
    if (page.revision !== revision) throw new Error('stale_index')
    this.pages.delete(pageId)
    this.pages.set(pageId, page)
    return page.index.visible(viewport)
  }

  drop(pageId: string) { this.pages.delete(pageId) }
}
