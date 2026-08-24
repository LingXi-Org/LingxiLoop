import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

export interface SelectMenuOption {
  value: string
  label: string
  disabled?: boolean
}

interface SelectMenuProps {
  value: string
  options: readonly SelectMenuOption[]
  onChange: (value: string) => void
  ariaLabel: string
  className?: string
  buttonClassName?: string
  size?: 'compact' | 'default'
  disabled?: boolean
}

export function SelectMenu({
  value,
  options,
  onChange,
  ariaLabel,
  className,
  buttonClassName,
  size = 'default',
  disabled = false,
}: SelectMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [position, setPosition] = useState({ left: 8, top: 8, width: 180, maxHeight: 280 })
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value))
  const selected = options[selectedIndex]
  const enabledIndexes = useMemo(
    () => options.map((option, index) => option.disabled ? -1 : index).filter((index) => index >= 0),
    [options],
  )

  useEffect(() => {
    if (!open) return
    setActiveIndex(options[selectedIndex]?.disabled ? (enabledIndexes[0] ?? 0) : selectedIndex)
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.max(180, rect.width)
      const below = window.innerHeight - rect.bottom - 12
      const above = rect.top - 12
      const maxHeight = Math.max(96, Math.min(300, Math.max(below, above)))
      const top = below >= Math.min(240, maxHeight)
        ? rect.bottom + 6
        : Math.max(8, rect.top - maxHeight - 6)
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top,
        width,
        maxHeight,
      })
    }
    place()
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!triggerRef.current?.contains(target) && !popupRef.current?.contains(target)) setOpen(false)
    }
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    document.addEventListener('pointerdown', closeOnOutside)
    window.requestAnimationFrame(() => popupRef.current?.focus())
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      document.removeEventListener('pointerdown', closeOnOutside)
    }
  }, [enabledIndexes, open, options, selectedIndex])

  const move = (direction: 1 | -1) => {
    if (enabledIndexes.length === 0) return
    const current = enabledIndexes.indexOf(activeIndex)
    const next = current < 0
      ? (direction > 0 ? 0 : enabledIndexes.length - 1)
      : (current + direction + enabledIndexes.length) % enabledIndexes.length
    setActiveIndex(enabledIndexes[next])
  }

  const choose = (index: number) => {
    const option = options[index]
    if (!option || option.disabled) return
    onChange(option.value)
    setOpen(false)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setOpen(false)
      triggerRef.current?.focus()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) setOpen(true)
      else move(event.key === 'ArrowDown' ? 1 : -1)
      return
    }
    if (open && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      choose(activeIndex)
      return
    }
    if (open && event.key === 'Home') {
      event.preventDefault(); setActiveIndex(enabledIndexes[0] ?? 0)
    } else if (open && event.key === 'End') {
      event.preventDefault(); setActiveIndex(enabledIndexes.at(-1) ?? 0)
    }
  }

  return (
    <div className={cn('relative inline-flex min-w-0', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={onKeyDown}
        className={cn('select-menu-trigger', size === 'compact' && 'select-menu-trigger-compact', buttonClassName)}
      >
        <span className="min-w-0 flex-1 truncate text-left">{selected?.label ?? options[0]?.label ?? ''}</span>
        <svg aria-hidden="true" viewBox="0 0 20 20" className={cn('select-menu-chevron', open && 'is-open')}>
          <path d="m5.75 7.75 4.25 4.5 4.25-4.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
        </svg>
      </button>
      {open && createPortal(
        <div
          ref={popupRef}
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className="select-menu-popup app-menu-surface"
          style={position}
        >
          {options.map((option, index) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              disabled={option.disabled}
              onPointerMove={() => !option.disabled && setActiveIndex(index)}
              onClick={() => choose(index)}
              className={cn('select-menu-option app-menu-item', activeIndex === index && 'is-active', option.value === value && 'is-selected')}
            >
              <span className="truncate">{option.label}</span>
              {option.value === value && (
                <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 shrink-0">
                  <path d="m4.5 10.25 3.25 3.25 7.75-7.75" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                </svg>
              )}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}
