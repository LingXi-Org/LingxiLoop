import { useLayoutEffect, useRef, useState } from 'react'
import { Combobox } from '@base-ui/react/combobox'
import { EDITOR_FONTS, editorFontFamily, type EditorFont } from './editor-fonts'
import { EditorIcon } from './EditorPrimitives'

export default function FontPopover({ selected, element = false, autoFocus = true, onChange, onClose }: { selected?: EditorFont; element?: boolean; autoFocus?: boolean; onChange(font: EditorFont): void; onClose(restoreFocus?: boolean): void }) {
  const search = useRef<HTMLInputElement>(null),[query,setQuery]=useState('')
  useLayoutEffect(() => { if (autoFocus && search.current?.closest('[popover]')?.matches(':popover-open')) search.current.focus({ preventScroll: true }) }, [autoFocus])
  return <Combobox.Root<EditorFont> inline open items={EDITOR_FONTS} value={selected ?? null} {...(element?{inputValue:query,onInputValueChange:setQuery}:{defaultInputValue:''})} autoHighlight
    itemToStringLabel={font => font.label} itemToStringValue={font => font.value}
    filter={(font, query) => `${font.label} ${font.family}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())}
    onValueChange={font => { if (font) { onChange(font); onClose(true) } }}>
    <div className="native-font-search"><div className="native-font-search-box"><EditorIcon name="search" size={14} /><Combobox.Input ref={search} aria-label="搜索字体" placeholder="搜索字体" />{element&&query&&<button type="button" className="native-font-clear" aria-label="清空字体搜索" onMouseDown={event=>event.preventDefault()} onClick={()=>{setQuery('');search.current?.focus()}}><EditorIcon name="close" size={12}/></button>}</div></div>
    <Combobox.Empty className="native-font-empty">未找到匹配字体</Combobox.Empty>
    <Combobox.List className="native-font-list">{(font: EditorFont) => <Combobox.Item key={font.value} value={font} className="native-font-option">
      <span style={{ fontFamily: editorFontFamily(font.family) }}>{font.label}</span>
      <Combobox.ItemIndicator className="native-font-indicator"><EditorIcon name="check" size={16} /></Combobox.ItemIndicator>
    </Combobox.Item>}</Combobox.List>
  </Combobox.Root>
}
