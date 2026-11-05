import { positionEditorPopover } from './popover-position'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
  type RefObject,
} from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Monitor,
  History,
  Bot,
  ArrowDownToLine,
  Play,
  PanelRight,
  ChevronDown,
  MousePointer2,
  Hand,
  Type,
  Frame,
  StickyNote,
  Pencil,
  PenTool,
  Square,
  Image,
  Table2,
  Shapes,
  Undo2,
  Redo2,
  Plus,
  MessageCircle,
  Layers,
  Maximize2,
  Grid2X2,
  BookOpen,
  X,
  MoreHorizontal,
  Check,
  Trash2,
  Copy,
  Lock,
  Eye,
  ArrowUp,
  ArrowDown,
  FlipHorizontal2,
  FlipVertical2,
  Crop,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  Minus,
  Circle,
  Triangle,
  Diamond,
  ArrowRight,
  ScanLine,
  Palette,
  Search,
} from 'lucide-react'

const icons = {
  search: Search,
  previous: ChevronLeft,
  next: ChevronRight,
  presenter: Monitor,
  history: History,
  agent:Bot,
  download: ArrowDownToLine,
  play: Play,
  panel: PanelRight,
  chevron: ChevronDown,
  select: MousePointer2,
  hand: Hand,
  text: Type,
  frame: Frame,
  note: StickyNote,
  pencil: Pencil,
  pen: PenTool,
  square: Square,
  image: Image,
  table: Table2,
  shapes: Shapes,
  undo: Undo2,
  redo: Redo2,
  plus: Plus,
  comments: MessageCircle,
  layers: Layers,
  fit: Maximize2,
  grid: Grid2X2,
  slides: Square,
  notes: BookOpen,
  close: X,
  more: MoreHorizontal,
  check: Check,
  delete: Trash2,
  copy: Copy,
  lock: Lock,
  eye: Eye,
  up: ArrowUp,
  down: ArrowDown,
  flipX: FlipHorizontal2,
  flipY: FlipVertical2,
  crop: Crop,
  left: AlignLeft,
  center: AlignCenter,
  right: AlignRight,
  top: AlignStartVertical,
  middle: AlignCenterVertical,
  bottom: AlignEndVertical,
  line: Minus,
  ellipse: Circle,
  triangle: Triangle,
  diamond: Diamond,
  arrow: ArrowRight,
  guides: ScanLine,
  theme: Palette,
}
export type EditorIconName = keyof typeof icons
export function EditorIcon({ name, size = 18 }: { name: EditorIconName; size?: number }) {
  const Icon = icons[name]
  return <Icon size={size} strokeWidth={1.6} aria-hidden="true" />
}
export function IconButton({
  icon,
  label,
  active,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: EditorIconName
  label: string
  active?: boolean
}) {
  return (
    <button
      type="button"
      className="native-icon-button"
      aria-label={label}
      title={label}
      aria-pressed={active === undefined ? undefined : active}
      {...props}
    >
      <EditorIcon name={icon} />
      {children}
    </button>
  )
}
export function ToolbarTools({ children }: { children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null),
    content = useRef<HTMLDivElement>(null),
    [forward, setForward] = useState(false)
  const measure = () => {
    const element = scroller.current
    if (element) setForward(element.scrollLeft + element.clientWidth < element.scrollWidth - 1)
  }
  useLayoutEffect(() => {
    const observer = new ResizeObserver(measure)
    if (scroller.current) observer.observe(scroller.current)
    if (content.current) observer.observe(content.current)
    measure()
    return () => observer.disconnect()
  }, [])
  return (
    <div className="native-tools-overflow">
      <div ref={scroller} className="native-tools-scroll" onScroll={measure}>
        <div ref={content} className="native-tools-content">
          {children}
        </div>
      </div>
      {forward && (
        <IconButton
          icon="next"
          label="更多编辑工具"
          onClick={() => scroller.current?.scrollBy({ left: 100, behavior: 'instant' })}
        />
      )}
    </div>
  )
}
export function Menu({
  label,
  icon,
  children,
  align = 'start',
  text,
  disabled,
  onOpen,
}: {
  label: string
  icon?: EditorIconName
  children: ReactNode
  align?: 'start' | 'end'
  text?: string
  disabled?: boolean
  onOpen?(): void
}) {
  const root = useRef<HTMLDetailsElement>(null),
    popup = useRef<HTMLDivElement>(null)
  const position = () => {
    const element = popup.current,
      details = root.current
    if (!element || !details) return
    if (!details.open) {
      if (element.matches(':popover-open')) element.hidePopover()
      return
    }
    if (!element.matches(':popover-open')) element.showPopover()
    positionEditorPopover(element, details.querySelector('summary')!, align, 184)
  }
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (root.current?.open && !root.current.contains(event.target as Node))
        root.current.open = false
    }
    const reposition = () => {
      if (root.current?.open) position()
    }
    const observer = new ResizeObserver(reposition),
      editor = root.current?.closest('[data-native-artifact-editor]')
    if (editor) observer.observe(editor)
    window.addEventListener('pointerdown', outside)
    window.addEventListener('resize', reposition)
    document.addEventListener('scroll', reposition, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('pointerdown', outside)
      window.removeEventListener('resize', reposition)
      document.removeEventListener('scroll', reposition, true)
    }
  }, [align])
  return (
    <details
      className="native-menu"
      ref={root}
      data-align={align}
      onToggle={(event) => {
        if (event.target === event.currentTarget) { position(); if (event.currentTarget.open) onOpen?.() }
      }}
      onKeyDown={(event) => {
        const element = root.current
        if (!element || disabled) return
        if (event.key === 'Escape') {
          event.stopPropagation()
          element.open = false
          element.querySelector('summary')?.focus()
        }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault()
          event.stopPropagation()
          element.open = true
          position()
          const items = Array.from(
            element.querySelectorAll<HTMLButtonElement>('button:not(:disabled),input,select'),
          )
          const index = items.indexOf(document.activeElement as HTMLButtonElement)
          items[
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? items.length - 1
                : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length
          ]?.focus()
        }
      }}
    >
      <summary
        aria-label={label}
        title={label}
        aria-disabled={disabled}
        onClick={(event) => {
          if (disabled) event.preventDefault()
        }}
      >
        {icon && <EditorIcon name={icon} />}
        {text && <span>{text}</span>}
        {(!icon || text || icon === 'square' || icon === 'shapes') && (
          <EditorIcon name="chevron" size={12} />
        )}
      </summary>
      <div
        ref={popup}
        popover="auto"
        className="native-menu-popup"
        role="group"
        aria-label={`${label}选项`}
        onToggle={(event) => {
          if ((event.nativeEvent as ToggleEvent).newState === 'closed' && root.current?.open)
            root.current.open = false
        }}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('[data-menu-action]') && root.current) {
            root.current.open = false
            root.current.querySelector('summary')?.focus()
          }
        }}
      >
        {children}
      </div>
    </details>
  )
}
export function MenuItem({
  children,
  icon,
  shortcut,
  selected,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: EditorIconName
  shortcut?: string
  selected?: boolean
}) {
  return (
    <button type="button" data-menu-action="" {...props}>
      {icon ? (
        <EditorIcon name={icon} size={16} />
      ) : selected ? (
        <EditorIcon name="check" size={16} />
      ) : (
        <span className="native-menu-spacer" />
      )}
      <span>{children}</span>
      {shortcut && <kbd>{shortcut}</kbd>}
    </button>
  )
}
export function Modal({
  title,
  onClose,
  children,
  editorBoundary,
}: {
  title: string
  onClose(): void
  children: ReactNode
  editorBoundary?:boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = ref.current
    if (element && !element.open) element.showModal()
    return () => {
      queueMicrotask(() => {
        if (element && !element.isConnected) element.close()
      })
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className="native-dialog"
      aria-label={title}
      data-native-editor-boundary={editorBoundary?'':undefined}
      onCancel={onClose}
      onClose={onClose}
    >
      <header>
        <h2>{title}</h2>
        <IconButton icon="close" label="关闭" onClick={onClose} />
      </header>
      {children}
    </dialog>
  )
}

export function FloatingPopover({anchor,label,className='',align='end',onClose,children}:{anchor:RefObject<HTMLElement|null>;label:string;className?:string;align?:'start'|'end';onClose(restoreFocus?:boolean):void;children:ReactNode}) {
  const popup=useRef<HTMLDivElement>(null),close=useRef(onClose);close.current=onClose
  useLayoutEffect(()=>{
    const element=popup.current,button=anchor.current;if(!element||!button)return
    element.showPopover()
    const update=()=>positionEditorPopover(element,button,align),observer=new ResizeObserver(update)
    observer.observe(element);observer.observe(button)
    const editor=button.closest('[data-native-artifact-editor]');if(editor)observer.observe(editor)
    const toggle=(event:Event)=>{if((event as ToggleEvent).newState==='closed')close.current()}
    element.addEventListener('toggle',toggle);window.addEventListener('resize',update);document.addEventListener('scroll',update,true);update();(element.querySelector<HTMLTextAreaElement>('textarea')??Array.from(element.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')).find(button=>button.checkVisibility()))?.focus({preventScroll:true})
    return()=>{observer.disconnect();element.removeEventListener('toggle',toggle);window.removeEventListener('resize',update);document.removeEventListener('scroll',update,true);queueMicrotask(()=>{if(!element.isConnected)element.hidePopover()})}
  },[anchor,align])
  useLayoutEffect(()=>{if(popup.current?.matches(':popover-open')&&anchor.current)positionEditorPopover(popup.current,anchor.current,align)})
  return <div ref={popup} popover="auto" role="dialog" aria-label={label} className={`native-floating-popover ${className}`} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose(true)}}}>{children}</div>
}
