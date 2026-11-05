import { lazy, Suspense, useRef, useState } from 'react'
import { EditorIcon, Menu, MenuItem } from './EditorPrimitives'
import { editorFontChoice, editorFontVariants, editorFontVariantLabel, type EditorFont, type EditorFontVariant } from './editor-fonts'

const FontPopover = lazy(() => import('./FontPopover'))
export function FontField({ value, theme, onBegin, onChange }: { value?: string; theme?: string; onBegin(): void; onChange(font: EditorFont): void }) {
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const selected = editorFontChoice(value, theme)
  return <div className="native-field native-font-field">
    <span>字体</span>
    <button ref={trigger} type="button" aria-label="字体" aria-haspopup="listbox" aria-expanded={open} onClick={() => { if (!open) onBegin(); setOpen(value => !value) }}>
      <span>{selected?.label ?? '自定义字体'}</span><EditorIcon name="chevron" size={12} />
    </button>
    {open && <Suspense fallback={null}><FontPopover anchor={trigger} selected={selected} onChange={onChange} onClose={() => setOpen(false)} /></Suspense>}
  </div>
}

export function FontVariantField({ family, weight = 400, style = 'normal', onBegin, onChange }: { family?: string; weight?: number; style?: 'normal' | 'italic'; onBegin(): void; onChange(variant: EditorFontVariant): void }) {
  return <div className="native-field native-font-field native-font-variants"><span>字重</span>
    <Menu label="字重" text={editorFontVariantLabel(weight, style)} onOpen={onBegin}>
      {editorFontVariants(family).map(variant => <MenuItem key={`${variant.weight}-${variant.style}`} selected={weight === variant.weight && style === variant.style} onClick={() => onChange(variant)}>{variant.label}</MenuItem>)}
    </Menu>
  </div>
}
