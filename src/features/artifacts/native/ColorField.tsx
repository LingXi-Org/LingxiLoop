import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import {editorColorLabel} from './editor-copy'
const ColorPopover = lazy(() => import('./ColorPopover'))
export const EditorPaletteContext = createContext<string[]>([])
export const EditorColorSessionContext = createContext<() => void>(() => {})

export function ColorField({
  label,
  value,
  onChange,
  description,
  disabled = false,
}: {
  label: string
  description?: string
  disabled?: boolean
  value: string
  onChange(value: string): void
}) {
  const colors = useContext(EditorPaletteContext)
  const begin = useContext(EditorColorSessionContext)
  const button = useRef<HTMLButtonElement>(null),
    [open, setOpen] = useState(false)
  const restore = useRef(false)
  const close = useCallback((restoreFocus = false) => {
    restore.current = restoreFocus
    setOpen(false)
  }, [])
  useEffect(() => {
    if (!open && restore.current) {
      restore.current = false
      button.current?.focus()
    }
  }, [open])
  return (
    <div className="native-field native-color-field">
      <span>{label}</span>
      <button
        ref={button}
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-description={description}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!open) begin()
          setOpen((v) => !v)
        }}
      >
        <i
          className="native-color-swatch"
          style={{ background: value === 'none' ? undefined : value }}
        />
        <span>{editorColorLabel(value).toUpperCase()}</span>
      </button>
      {open && (
        <Suspense fallback={null}>
          <ColorPopover
            label={label}
            value={value}
            colors={colors}
            anchor={button}
            onChange={onChange}
            onClose={close}
          />
        </Suspense>
      )}
    </div>
  )
}
