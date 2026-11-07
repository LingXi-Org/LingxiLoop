import { useEffect, useRef, useState } from 'react'
import { useLocalDraft } from './draft-context'

export default function TextAreaField({
  value,
  label,
  placeholder,
  disabled,
  onFocus,
  onCommit,
  className,
}: {
  value: string
  label: string
  placeholder?: string
  disabled?: boolean
  onFocus?(): void
  onCommit(value: string): void
  className?: string
}) {
  const [draft, setDraft] = useState(value)
  const focused = useRef(false),
    dirty = useRef(false),
    composing = useRef(false),
    flushAfterComposition = useRef(false)
  const latest = useRef({ draft, value, onCommit })
  latest.current = { draft, value, onCommit }
  const save = () => {
    if (composing.current) {
      flushAfterComposition.current = true
      return
    }
    if (dirty.current && latest.current.draft !== latest.current.value)
      latest.current.onCommit(latest.current.draft)
    dirty.current = false
    markDirty(false)
  }
  const markDirty = useLocalDraft(save)
  useEffect(() => {
    if (!focused.current) {
      setDraft(value)
      latest.current.draft = value
      dirty.current = false
      markDirty(false)
    }
  }, [value, markDirty])
  const change = (value: string) => {
    latest.current.draft = value
    setDraft(value)
    dirty.current = value !== latest.current.value
    markDirty(dirty.current || composing.current)
  }
  return (
    <textarea
      className={className}
      aria-label={label}
      placeholder={placeholder}
      disabled={disabled}
      value={draft}
      onFocus={() => {
        focused.current = true
        onFocus?.()
      }}
      onChange={(event) => change(event.target.value)}
      onCompositionStart={() => {
        composing.current = true
        markDirty(true)
      }}
      onCompositionEnd={(event) => {
        composing.current = false
        change(event.currentTarget.value)
        if (flushAfterComposition.current) {
          flushAfterComposition.current = false
          queueMicrotask(save)
        }
      }}
      onBlur={() => {
        focused.current = false
        save()
        if (!composing.current) setDraft(latest.current.value)
      }}
    />
  )
}
