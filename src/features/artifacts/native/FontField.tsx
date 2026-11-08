import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { EditorIcon, Menu, MenuItem, FloatingPopover } from './EditorPrimitives'
import { editorFontChoice, editorFontVariants, editorFontMenuVariants, editorFontVariantLabel, type EditorFont, type EditorFontVariant } from './editor-fonts'

const FontPopover = lazy(() => import('./FontPopover'))
export function FontField({ value, theme, element = false, disabled = false, onReset, families, onBegin, onChange }: { value?: string; theme?: string; element?: boolean; disabled?: boolean; onReset?():void; families?:readonly string[]; onBegin(): void; onChange(font: EditorFont): void }) {
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const restore = useRef(false),openingKey=useRef<'ArrowDown'|'ArrowUp'|null>(null)
  const close = (restoreFocus = false) => { restore.current = restoreFocus; setOpen(false) }
  useEffect(() => { if (disabled) close() }, [disabled])
  useEffect(() => { if (!open && restore.current) { restore.current = false; if (!disabled) trigger.current?.focus() } }, [open, disabled])
  const selected = editorFontChoice(value, theme),focusSearch=!element||typeof window==='undefined'||!window.matchMedia('(pointer:coarse)').matches
  return <div className="native-field native-font-field" data-inherited={element&&!onReset||undefined} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close() }} onKeyDown={event => { if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true) } }}>
    <span className={element?"native-font-label":undefined}>{element?<><span className="native-font-label-text">字体</span>{onReset&&<span className="native-font-reset-wrap"><button type="button" className="native-font-reset" aria-label="还原字体" title="使用继承的字体" disabled={disabled} onClick={()=>{onBegin();onReset()}}><EditorIcon name="line" size={12}/></button></span>}</>:"字体"}</span>
    <button ref={trigger} type="button" disabled={disabled} aria-label="字体" aria-haspopup={element?'menu':'dialog'} aria-expanded={open && !disabled} onKeyDown={event=>{if(element&&(event.key==='ArrowDown'||event.key==='ArrowUp')){event.preventDefault();event.stopPropagation();openingKey.current=event.key;onBegin();setOpen(true)}}} onClick={() => { openingKey.current=null;if (!open) onBegin(); setOpen(value => !value) }}>
      <span>{selected?.label ?? '自定义字体'}</span><EditorIcon name="chevron" size={12} />
    </button>
    {open && !disabled && <FloatingPopover anchor={trigger} label="字体选择" role={element?'menu':'dialog'} align="start" initialFocusSelector={element&&openingKey.current?'[data-font-current=true]':focusSearch?"input":undefined} className={`native-font-popup${element?' native-element-font-popup':''}`} matchAnchorWidth={element} stableWhileOpen={element} gap={element?6:4} onClose={close}>
      <Suspense fallback={<div role="status" className="native-font-empty">正在加载字体选项…</div>}><FontPopover autoFocus={focusSearch&&!openingKey.current} element={element} selected={selected} families={families} currentFamily={element&&onReset?value:undefined} initialKey={openingKey.current} onChange={onChange} onClose={close} /></Suspense>
    </FloatingPopover>}
  </div>
}

export function FontVariantField({ family, weight = 400, style = 'normal', preserveCurrent = false, disabled = false, onBegin, onChange }: { family?: string; weight?: number; style?: 'normal' | 'italic'; preserveCurrent?: boolean; disabled?: boolean; onBegin(): void; onChange(variant: EditorFontVariant): void }) {
  return <div className="native-field native-font-field native-font-variants"><span>字重</span>
    <Menu label="字重" text={editorFontVariantLabel(weight, style)} disabled={disabled} onOpen={onBegin}>
      {(preserveCurrent?editorFontMenuVariants(family,weight,style):editorFontVariants(family)).map(variant => <MenuItem key={`${variant.weight}-${variant.style}`} selected={weight === variant.weight && style === variant.style} onClick={() => onChange(variant)}>{variant.label}</MenuItem>)}
    </Menu>
  </div>
}
