export type DraftFlushReason = 'save'|'unmount'
type DraftEntry = { flush(reason?:DraftFlushReason): void; dirty: boolean }

/** Transient control drafts belong to one editor instance, outside document history. */
export class NativeDrafts {
  private entries = new Map<symbol, DraftEntry>()
  private listeners = new Set<() => void>()
  private dirtyCount = 0

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  getSnapshot = () => this.dirtyCount

  private changed() { for (const listener of [...this.listeners]) listener() }

  register(key: symbol, flush: (reason?:DraftFlushReason) => void): () => void {
    const entry = { flush, dirty: this.entries.get(key)?.dirty ?? false }
    this.entries.set(key, entry)
    let disposed = false
    return () => {
      if (disposed || this.entries.get(key) !== entry) return
      disposed = true
      try { entry.flush('unmount') }
      finally {
        if (this.entries.get(key) === entry) {
          this.entries.delete(key)
          if (entry.dirty) { this.dirtyCount--; this.changed() }
        }
      }
    }
  }

  mark(key: symbol, dirty: boolean) {
    const entry = this.entries.get(key)
    if (!entry || entry.dirty === dirty) return
    entry.dirty = dirty
    this.dirtyCount += dirty ? 1 : -1
    this.changed()
  }

  /** A composing control may retain its draft; only that control acknowledges it. */
  flush(reason?:DraftFlushReason) {
    for (const [key, entry] of [...this.entries]) {
      if (this.entries.get(key) === entry) entry.flush(reason)
    }
  }
}
