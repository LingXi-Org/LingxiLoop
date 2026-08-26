import { useEffect, useRef } from 'react'
import {
  ContextMenuContent,
  ContextMenuItem as ContextMenuPrimitiveItem,
  ContextMenu as ContextMenuRoot,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'

export interface ContextMenuItem {
  label: string
  onSelect?: () => void
  icon?: React.ReactNode
  destructive?: boolean
  hint?: string
  disabled?: boolean
  submenu?: ContextMenuItem[]
  keepOpen?: boolean
}

interface Props {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
  label?: string
}

function MenuItems({ items, onClose }: { items: ContextMenuItem[]; onClose: () => void }) {
  return items.map((item, index) => {
    const content = <>{item.icon}{<span className="flex-1">{item.label}</span>}{item.hint && <ContextMenuShortcut>{item.hint}</ContextMenuShortcut>}</>
    if (item.submenu?.length) {
      return <ContextMenuSub key={`${item.label}:${index}`}>
        <ContextMenuSubTrigger disabled={item.disabled}>{content}</ContextMenuSubTrigger>
        <ContextMenuSubContent><MenuItems items={item.submenu} onClose={onClose} /></ContextMenuSubContent>
      </ContextMenuSub>
    }
    return <ContextMenuPrimitiveItem
      key={`${item.label}:${index}`}
      disabled={item.disabled}
      variant={item.destructive ? 'destructive' : 'default'}
      onClick={(event) => {
        if (item.keepOpen) event.preventDefault()
        item.onSelect?.()
        if (!item.keepOpen) onClose()
      }}
    >{content}</ContextMenuPrimitiveItem>
  })
}

export function ContextMenu({ x, y, items, onClose, label = '操作菜单' }: Props) {
  const triggerRef = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    trigger.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2, buttons: 2 }))
  }, [x, y])
  return <ContextMenuRoot onOpenChange={(open) => { if (!open) onClose() }}>
    <ContextMenuTrigger render={<span ref={triggerRef} className="pointer-events-none fixed size-px" style={{ left: x, top: y }} />} />
    <ContextMenuContent aria-label={label} className="min-w-[200px]">
      <MenuItems items={items} onClose={onClose} />
    </ContextMenuContent>
  </ContextMenuRoot>
}
