import type { ArtifactDocument } from '../../../../shared/artifact-document'
export interface SpeakerNoteDraft {
  text: string
  base: ArtifactDocument
  composing: boolean
  flushRequested?: boolean
  deferUntilSave?: boolean
}
export type CommitSpeakerNote = (pageId: string, text: string, base: ArtifactDocument) => boolean
/** The editor owns note drafts independently of popup, focus and write permission. */
export class SpeakerNoteDraftStore {
  private entries = new Map<string, SpeakerNoteDraft>()
  private listeners = new Set<() => void>()
  private version = 0
  private resetVersion = 0
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  getSnapshot = () => this.version
  private changed() {
    this.version++
    for (const listener of this.listeners) listener()
  }
  get size() {
    return this.entries.size
  }
  get(pageId: string) {
    return this.entries.get(pageId)
  }
  set(pageId: string, text: string, base: ArtifactDocument, composing = false) {
    const previous = this.entries.get(pageId),
      start = previous?.base ?? base
    if (!composing && text === start.pages[pageId]?.notes) {
      if (this.entries.delete(pageId)) this.changed()
      return
    }
    if (previous?.text === text && previous.composing === composing) return
    this.entries.set(pageId, {
      text,
      base: start,
      composing,
      flushRequested: previous?.flushRequested,
    })
    this.changed()
  }
  suspendComposition(pageId: string) {
    const draft = this.entries.get(pageId)
    if (draft?.composing) {
      this.entries.set(pageId, { ...draft, composing: false, deferUntilSave: true })
      this.changed()
    }
  }
  flush(commit: CommitSpeakerNote, pageId?: string, explicit = false) {
    for (const [id, draft] of [...this.entries]) {
      if (pageId && id !== pageId) continue
      if (draft.composing) {
        if (explicit && !draft.flushRequested) {
          this.entries.set(id, { ...draft, flushRequested: true })
          this.changed()
        }
        continue
      }
      if (draft.deferUntilSave && !explicit) continue
      if (commit(id, draft.text, draft.base) && this.entries.get(id) === draft) {
        this.entries.delete(id)
        this.changed()
      }
    }
  }
  get resetGeneration() {
    return this.resetVersion
  }
  clear() {
    this.entries.clear()
    this.resetVersion++
    this.changed()
  }
  recovery() {
    return Object.fromEntries(
      [...this.entries].map(([id, draft]) => [
        id,
        {
          text: draft.text,
          baseNotes: draft.base.pages[id]?.notes,
          baseSeq: draft.base.seq,
          composing: draft.composing,
          deferUntilSave: draft.deferUntilSave,
        },
      ]),
    )
  }
}
