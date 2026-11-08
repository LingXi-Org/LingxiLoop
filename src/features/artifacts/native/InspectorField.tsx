import {useEffect,useRef,useState,type ReactNode} from 'react'
import {ColorField} from './ColorField'
import {useLocalDraft} from './draft-context'

export default function InspectorField({ label, value, onChange, type = 'text', min, max, placeholder, unit, leadingIcon, inputLabel }: { label: string; value: string | number; onChange(value: string): void; type?: string; min?: number; max?: number;placeholder?:string;unit?:boolean;leadingIcon?:ReactNode;inputLabel?:string }) {
  const [draft, setDraft] = useState(String(value))
  const focused = useRef(false), dirty = useRef(false), composing = useRef(false), flushAfterComposition = useRef(false)
  const latest = useRef({ draft, value: String(value), onChange }); latest.current = { draft, value: String(value), onChange }
  const save = () => {
    if (composing.current) { flushAfterComposition.current = true; return }
    if (dirty.current && latest.current.draft !== latest.current.value) latest.current.onChange(latest.current.draft)
    dirty.current = false; markDirty(false)
  }
  const markDirty = useLocalDraft(save)
  useEffect(() => { if (!focused.current) { setDraft(String(value)); latest.current.draft = String(value); dirty.current = false; markDirty(false) } }, [value, markDirty])
  const change = (value: string) => { latest.current.draft = value; setDraft(value); dirty.current = value !== latest.current.value; markDirty(dirty.current || composing.current) }
  const input=<input aria-label={inputLabel??label} placeholder={placeholder} type={type} min={min} max={max} value={draft} onFocus={() => { focused.current = true }} onChange={event => change(event.target.value)} onCompositionStart={() => { composing.current = true; markDirty(true) }} onCompositionEnd={event => { composing.current = false; change(event.currentTarget.value); if (flushAfterComposition.current) { flushAfterComposition.current = false; queueMicrotask(save) } }} onBlur={() => { focused.current = false; save(); if (!composing.current) setDraft(latest.current.value) }} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.currentTarget.blur() }} />
  return type==='color'?<ColorField label={label} value={String(value)} onChange={onChange} />:<label className="native-field"><span>{label}</span>{unit||leadingIcon?<span className="native-unit-input">{leadingIcon&&<span className="native-numeric-leading" aria-hidden="true">{leadingIcon}</span>}{input}{unit&&<span className="native-field-unit" aria-hidden="true">像素</span>}</span>:input}</label>
}
