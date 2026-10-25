import { useRef, type KeyboardEvent, type ReactNode, type Ref } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import './learning-page-header.css'

export function LearningPageHeader({ title, actions, description, headingRef }: {
  title: string
  actions?: ReactNode
  description?: ReactNode
  headingRef?: Ref<HTMLHeadingElement>
}) {
  return <header className="learning-page-header">
    <div className="learning-page-heading">
      <h1 ref={headingRef} tabIndex={headingRef ? -1 : undefined}>{title}</h1>
      {description && <p className="learning-page-description">{description}</p>}
    </div>
    {actions && <div className="learning-page-actions">{actions}</div>}
  </header>
}

export function LearningTopTabs<T extends string>({ label, value, onValueChange, items }: {
  label: string
  value: T
  onValueChange(value: T): void
  items: readonly { value: T; label: string }[]
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl'
    if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = items.length - 1
    else if (event.key === 'ArrowRight') next = (index + (rtl ? -1 : 1) + items.length) % items.length
    else if (event.key === 'ArrowLeft') next = (index + (rtl ? 1 : -1) + items.length) % items.length
    else return
    event.preventDefault()
    buttons.current[next]?.focus({ preventScroll: true })
    buttons.current[next]?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    onValueChange(items[next].value)
  }
  return <nav aria-label={label} className="learning-top-tabs">
    {items.map((item, index) => <Button key={item.value} ref={node => { buttons.current[index] = node }} type="button" variant="ghost"
      className="learning-top-tab" aria-pressed={value === item.value} onClick={() => onValueChange(item.value)} onKeyDown={event => move(event, index)}>{item.label}</Button>)}
  </nav>
}

export function LearningPageToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('learning-page-toolbar', className)}>{children}</div>
}
