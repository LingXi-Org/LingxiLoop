import { useEffect, useRef, type ReactNode, type ButtonHTMLAttributes } from 'react'
import { ArrowDownToLine, Play, PanelRight, ChevronDown, MousePointer2, Hand, Type, Frame, StickyNote, Pencil, PenTool, Square, Image, Table2, Shapes, Undo2, Redo2, Plus, MessageCircle, Layers, Maximize2, Grid2X2, BookOpen, X, MoreHorizontal, Check, Trash2, Copy, Lock, Eye, ArrowUp, ArrowDown, FlipHorizontal2, FlipVertical2, Crop, AlignLeft, AlignCenter, AlignRight, AlignStartVertical, AlignCenterVertical, AlignEndVertical, Minus, Circle, Triangle, Diamond, ArrowRight, ScanLine, Palette } from 'lucide-react'

const icons = { download: ArrowDownToLine, play: Play, panel: PanelRight, chevron: ChevronDown, select: MousePointer2, hand: Hand, text: Type, frame: Frame, note: StickyNote, pencil: Pencil, pen: PenTool, square: Square, image: Image, table: Table2, shapes: Shapes, undo: Undo2, redo: Redo2, plus: Plus, comments: MessageCircle, layers: Layers, fit: Maximize2, grid: Grid2X2, slides: Square, notes: BookOpen, close: X, more: MoreHorizontal, check: Check, delete: Trash2, copy: Copy, lock: Lock, eye: Eye, up: ArrowUp, down: ArrowDown, flipX: FlipHorizontal2, flipY: FlipVertical2, crop: Crop, left: AlignLeft, center: AlignCenter, right: AlignRight, top: AlignStartVertical, middle: AlignCenterVertical, bottom: AlignEndVertical, line: Minus, ellipse: Circle, triangle: Triangle, diamond: Diamond, arrow: ArrowRight, guides: ScanLine, theme: Palette }
export type EditorIconName = keyof typeof icons
export function EditorIcon({ name, size = 18 }: { name: EditorIconName; size?: number }) { const Icon = icons[name]; return <Icon size={size} strokeWidth={1.6} aria-hidden="true" /> }
export function IconButton({ icon, label, active, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: EditorIconName; label: string; active?: boolean }) {
  return <button type="button" className="native-icon-button" aria-label={label} title={label} aria-pressed={active === undefined ? undefined : active} {...props}><EditorIcon name={icon} />{children}</button>
}
export function Menu({ label, icon, children, align = 'start', text, disabled }: { label: string; icon?: EditorIconName; children: ReactNode; align?: 'start' | 'end'; text?: string; disabled?: boolean }) {
  const root = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (root.current?.open && !root.current.contains(event.target as Node)) root.current.open = false }
    window.addEventListener('pointerdown', outside)
    return () => window.removeEventListener('pointerdown', outside)
  }, [])
  return <details className="native-menu" ref={root} data-align={align} onKeyDown={event => {
    const element = root.current; if (!element || disabled) return
    if (event.key === 'Escape') { event.stopPropagation(); element.open = false; element.querySelector('summary')?.focus() }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation(); element.open = true
      const items = Array.from(element.querySelectorAll<HTMLButtonElement>('button:not(:disabled),input,select'))
      const index = items.indexOf(document.activeElement as HTMLButtonElement)
      items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length]?.focus()
    }
  }}>
    <summary aria-label={label} title={label} aria-disabled={disabled} onClick={event => { if (disabled) event.preventDefault() }}>{icon && <EditorIcon name={icon} />}{text && <span>{text}</span>}{(!icon || icon === 'square' || icon === 'shapes') && <EditorIcon name="chevron" size={12} />}</summary>
    <div className="native-menu-popup" role="group" aria-label={`${label}选项`} onClick={event => { if ((event.target as HTMLElement).closest('[data-menu-action]') && root.current) { root.current.open = false; root.current.querySelector('summary')?.focus() } }}>{children}</div>
  </details>
}
export function MenuItem({ children, icon, shortcut, selected, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: EditorIconName; shortcut?: string; selected?: boolean }) {
  return <button type="button" data-menu-action="" {...props}>{icon ? <EditorIcon name={icon} size={16} /> : selected ? <EditorIcon name="check" size={16} /> : <span className="native-menu-spacer" />}<span>{children}</span>{shortcut && <kbd>{shortcut}</kbd>}</button>
}
export function Modal({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { const element=ref.current; if(element && !element.open) element.showModal(); return () => { queueMicrotask(()=>{if(element && !element.isConnected) element.close()}) } }, [])
  return <dialog ref={ref} className="native-dialog" aria-label={title} onCancel={onClose} onClose={onClose}><header><h2>{title}</h2><IconButton icon="close" label="关闭" onClick={onClose} /></header>{children}</dialog>
}
