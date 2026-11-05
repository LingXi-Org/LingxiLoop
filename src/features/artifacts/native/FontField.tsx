import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { EditorIcon, Menu, MenuItem, FloatingPopover } from './EditorPrimitives'
import { editorFontChoice, editorFontVariants, editorFontVariantLabel, type EditorFont, type EditorFontVariant } from './editor-fonts'

const FontPopover = lazy(() => import('./FontPopover'))
export function FontField({ value, theme, disabled = false, onBegin, onChange }: { value?: string; theme?: string; disabled?: boolean; onBegin(): void; onChange(font: EditorFont): void }) {
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const restore = useRef(false)
  const close = (restoreFocus = false) => { restore.current = restoreFocus; setOpen(false) }
  useEffect(() => { if (disabled) close() }, [disabled])
  useEffect(() => { if (!open && restore.current) { restore.current = false; if (!disabled) trigger.current?.focus() } }, [open, disabled])
  const selected = editorFontChoice(value, theme)
  return <div className="native-field native-font-field" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close() }} onKeyDown={event => { if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true) } }}>
    <span>字体</span>
    <button ref={trigger} type="button" disabled={disabled} aria-label="字体" aria-haspopup="dialog" aria-expanded={open && !disabled} onClick={() => { if (!open) onBegin(); setOpen(value => !value) }}>
      <span>{selected?.label ?? '自定义字体'}</span><EditorIcon name="chevron" size={12} />
    </button>
    {open && !disabled && <FloatingPopover anchor={trigger} label="字体选择" align="start" initialFocusSelector="input" className="native-font-popup" onClose={close}>
      <Suspense fallback={<div role="status" className="native-font-empty">正在加载字体选项…</div>}><FontPopover selected={selected} onChange={onChange} onClose={close} /></Suspense>
    </FloatingPopover>}
  </div>
}

export function FontVariantField({ family, weight = 400, style = 'normal', disabled = false, onBegin, onChange }: { family?: string; weight?: number; style?: 'normal' | 'italic'; disabled?: boolean; onBegin(): void; onChange(variant: EditorFontVariant): void }) {
  return <div className="native-field native-font-field native-font-variants"><span>字重</span>
    <Menu label="字重" text={editorFontVariantLabel(weight, style)} disabled={disabled} onOpen={onBegin}>
      {editorFontVariants(family).map(variant => <MenuItem key={`${variant.weight}-${variant.style}`} selected={weight === variant.weight && style === variant.style} onClick={() => onChange(variant)}>{variant.label}</MenuItem>)}
    </Menu>
  </div>
}
