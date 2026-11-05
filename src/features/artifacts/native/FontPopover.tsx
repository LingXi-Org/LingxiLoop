import { useRef, type RefObject } from 'react'
import { Combobox } from '@base-ui/react/combobox'
import { EDITOR_FONTS, editorFontFamily, type EditorFont } from './editor-fonts'
import { EditorIcon } from './EditorPrimitives'

export default function FontPopover({ anchor, selected, onChange, onClose }: { anchor: RefObject<HTMLButtonElement | null>; selected?: EditorFont; onChange(font: EditorFont): void; onClose(): void }) {
  const search = useRef<HTMLInputElement>(null)
  return <Combobox.Root<EditorFont> open items={EDITOR_FONTS} value={selected ?? null} defaultInputValue="" autoHighlight
    itemToStringLabel={font => font.label} itemToStringValue={font => font.value}
    filter={(font, query) => `${font.label} ${font.family}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())}
    onOpenChange={open => { if (!open) onClose() }} onValueChange={font => { if (font) { onChange(font); onClose() } }}>
    <Combobox.Portal container={anchor.current?.closest<HTMLElement>('[data-native-artifact-editor]')}>
      <Combobox.Positioner anchor={anchor} side="bottom" align="start" sideOffset={6} positionMethod="fixed" collisionBoundary={anchor.current?.closest<HTMLElement>('[data-native-artifact-editor]') ?? undefined} collisionPadding={8} className="native-font-positioner">
        <Combobox.Popup className="native-font-popup" initialFocus={search} finalFocus={anchor}>
          <div className="native-font-search"><EditorIcon name="search" size={14} /><Combobox.Input ref={search} aria-label="搜索字体" placeholder="搜索字体" /></div>
          <Combobox.Empty className="native-font-empty">未找到匹配字体</Combobox.Empty>
          <Combobox.List className="native-font-list">{(font: EditorFont) => <Combobox.Item key={font.value} value={font} className="native-font-option">
            <span style={{ fontFamily: editorFontFamily(font.family) }}>{font.label}</span>
            <Combobox.ItemIndicator className="native-font-indicator"><EditorIcon name="check" size={16} /></Combobox.ItemIndicator>
          </Combobox.Item>}</Combobox.List>
        </Combobox.Popup>
      </Combobox.Positioner>
    </Combobox.Portal>
  </Combobox.Root>
}
