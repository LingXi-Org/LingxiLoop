import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
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
  const version = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const [text, setText] = useState(() => store.get(page.id)?.text ?? page.notes)
  const base = useRef(store.get(page.id)?.base ?? getBase()),
    focused = useRef(false),
    composing = useRef(false),
    flushAfterComposition = useRef(false)
  const lifetime = useRef<object | null>(null)
  const latest = useRef({ page, store, commit })
  latest.current = { page, store, commit }
  const flush = () => store.flush(commit, page.id)
  useEffect(() => {
    if (!focused.current) {
      setText(store.get(page.id)?.text ?? page.notes)
      base.current = store.get(page.id)?.base ?? getBase()
    }
  }, [page.notes, page.id, store, version, getBase])
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
    setText(value)
    store.set(page.id, value, base.current, composing.current)
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
        focused.current = true
        base.current = store.get(page.id)?.base ?? getBase()
        if (store.get(page.id)?.composing) store.set(page.id, text, base.current, false)
      }}
      onChange={(event) => change(event.target.value)}
      onCompositionStart={() => {
        composing.current = true
        store.set(page.id, text, base.current, true)
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
        focused.current = false
        if (composing.current) {
          flushAfterComposition.current = true
          return
        }
        flush()
      }}
    />
  )
}
