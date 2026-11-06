import { useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import type { ArtifactDocument, ArtifactPage } from '../../../../shared/artifact-document'
import type { CommitSpeakerNote, SpeakerNoteDraftStore } from './speaker-note-drafts'
interface Props {
  page: ArtifactPage
  store: SpeakerNoteDraftStore
  writable: boolean
  getBase(): ArtifactDocument
  commit: CommitSpeakerNote
}
export default function SpeakerNotesField({ page, store, writable, getBase, commit }: Props) {
  useSyncExternalStore(store.subscribe, store.getSnapshot)
  // Text and its CAS snapshot always travel together. The store retains the first
  // local-edit snapshot; a clean field follows the current document, even focused.
  const draft = store.get(page.id)
  const text = draft?.text ?? page.notes
  const base = draft?.base ?? getBase()
  const composing = useRef(false), flushAfterComposition = useRef(false)
  const lifetime = useRef<object | null>(null)
  const latest = useRef({ page, store, commit })
  latest.current = { page, store, commit }
  const flush = () => store.flush(commit, page.id)
  useLayoutEffect(() => {
    const token = {}
    lifetime.current = token
    return () =>
      queueMicrotask(() => {
        if (lifetime.current === token) {
          const value = latest.current
          if (value.store.get(value.page.id)?.composing)
            value.store.suspendComposition(value.page.id)
          else value.store.flush(value.commit, value.page.id)
        }
      })
  }, [])
  const change = (value: string) => {
    store.set(page.id, value, base, composing.current)
  }
  return (
    <textarea
      className="native-speaker-notes"
      aria-label="讲者备注"
      placeholder="添加讲者备注"
      maxLength={100_000}
      value={text}
      readOnly={!writable}
      onFocus={() => {
        if (store.get(page.id)?.composing) store.set(page.id, text, base, false)
      }}
      onChange={(event) => change(event.target.value)}
      onCompositionStart={() => {
        composing.current = true
        store.set(page.id, text, base, true)
      }}
      onCompositionEnd={(event) => {
        const requested = store.get(page.id)?.flushRequested
        composing.current = false
        change(event.currentTarget.value)
        if (flushAfterComposition.current || requested) {
          flushAfterComposition.current = false
          queueMicrotask(flush)
        }
      }}
      onBlur={() => {
        if (composing.current) {
          flushAfterComposition.current = true
          return
        }
        flush()
      }}
    />
  )
}
