interface Submission { id: number; text: string }
interface Draft { text: string; pending?: Submission; failed?: boolean }

// Lives with the editor, so closing a popover never resets a pending request.
export class CommentDraftStore {
  private entries = new Map<string, Draft>()
  private listeners = new Set<() => void>()
  private version = 0
  private nextSubmission = 0
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  getSnapshot = () => this.version
  private changed() { this.version++; for (const listener of this.listeners) listener() }
  get size() { return this.entries.size }
  get(key: string) { return this.entries.get(key)?.text }
  set(key: string, text: string) { this.entries.set(key, { ...this.entries.get(key), text }); this.changed() }
  delete(key: string) { if (!this.pending(key) && this.entries.delete(key)) this.changed() }
  pending(key: string) { return !!this.entries.get(key)?.pending }
  failed(key: string) { return !!this.entries.get(key)?.failed }
  pendingForThread(threadId: string, anchor?: string) {
    return [...this.entries].some(([key, value]) => value.pending && (key === `reply:${threadId}` || key.startsWith(`edit:${threadId}:`) || (anchor !== undefined && key === `new:${anchor}`)))
  }
  begin(key: string, text: string) {
    if (this.pending(key)) return
    const ticket = { id: ++this.nextSubmission, text }
    this.entries.set(key, { text, pending: ticket }); this.changed()
    return ticket
  }
  finish(key: string, ticket: Submission, success: boolean) {
    const entry = this.entries.get(key)
    if (entry?.pending !== ticket) return
    if (success && entry.text === ticket.text) this.entries.delete(key)
    else this.entries.set(key, { text: entry.text, failed: !success })
    this.changed()
  }
  recovery() { return Object.fromEntries([...this.entries].map(([key, value]) => [key, { text: value.text }])) }
}
