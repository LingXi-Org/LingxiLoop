import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import {positionEditorPopover}from'./popover-position'
import { IconButton } from './EditorPrimitives'
import { useLocalDraft } from './draft-context'
import {editorColorLabel} from './editor-copy'

function normalizedColor(value: string) {
  if (value === 'none') return '#00000000'
  if (/^#[\da-f]{3,4}$/i.test(value))
    return (
      '#' +
      [...value.slice(1)]
        .map((c) => c + c)
        .join('')
        .toLowerCase()
    )
  if (/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(value)) return value.toLowerCase()
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const context = canvas.getContext('2d')!
  context.fillStyle = value
  const canonical = context.fillStyle
  if (/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(canonical)) return canonical
  const rgb = /^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/.exec(canonical)
  if (rgb) {
    const alpha = Math.round(Number(rgb[4] ?? 1) * 255)
    return (
      '#' +
      [...rgb.slice(1, 4).map((v) => Math.round(Number(v))), ...(alpha < 255 ? [alpha] : [])]
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('')
    )
  }
  context.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
  return `#${[r, g, b, ...(a < 255 ? [a] : [])].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}
function rgbToHsv(hex: string) {
  const raw = /^#[\da-f]{6}$/i.test(hex) ? hex : '#ffffff'
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(raw.slice(i, i + 2), 16) / 255),
    max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min
  return {
    h: d
      ? 60 *
        (max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4)
      : 0,
    s: max ? d / max : 0,
    v: max,
  }
}
function hsvToHex(h: number, s: number, v: number, alpha: number) {
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    return Math.round(255 * v * (1 - s * Math.max(0, Math.min(k, 4 - k, 1))))
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(5)}${f(3)}${f(1)}${
    alpha < 1
      ? Math.round(alpha * 255)
          .toString(16)
          .padStart(2, '0')
      : ''
  }`
}
export default function ColorPopover({
  label,
  value,
  colors,
  anchor,
  onChange,
  onClose,
}: {
  label: string
  value: string
  colors: string[]
  anchor: RefObject<HTMLButtonElement | null>
  onChange(value: string): void
  onClose(restoreFocus?: boolean): void
}) {
  const ref = useRef<HTMLDivElement>(null),
    [tab, setTab] = useState<'theme' | 'custom'>('theme')
  const [initial] = useState(() => normalizedColor(value))
  const [hsv, setHsv] = useState(() => rgbToHsv(initial.slice(0, 7))),
    [alpha, setAlpha] = useState(
      initial.length === 9 ? Number.parseInt(initial.slice(7), 16) / 255 : 1,
    ),
    [hex, setHex] = useState(initial)
  const latest = useRef({ hsv, alpha, hex, onChange })
  latest.current = { hsv, alpha, hex, onChange }
  const dirty = useRef(false)
  const save = () => {
    if (dirty.current && /^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(latest.current.hex)) {
      choose(latest.current.hex)
    }
  }
  const markDirty = useLocalDraft(save)
  const draftColor = (color: string) => {
    latest.current.hex = color
    setHex(color)
    dirty.current = true
    markDirty(true)
  }
  const palette = Array.from(new Set([value, ...colors].filter((c) => c !== 'none'))).slice(0, 32)
  useLayoutEffect(() => {
    const element = ref.current,
      button = anchor.current
    if (!element || !button) return
    element.showPopover()
    const update=()=>positionEditorPopover(element,button,'end')
    const observer=new ResizeObserver(update)
    observer.observe(element);observer.observe(button)
    const editor=button.closest('[data-native-artifact-editor]');if(editor)observer.observe(editor)
    window.addEventListener('resize',update);document.addEventListener('scroll',update,true);update()
    const toggle = (event: Event) => {
      if ((event as ToggleEvent).newState === 'closed') onClose()
    }
    element.addEventListener('toggle', toggle)
    return () => {
      observer.disconnect();window.removeEventListener('resize',update);document.removeEventListener('scroll',update,true)
      element.removeEventListener('toggle', toggle)
      queueMicrotask(() => {
        if (!element.isConnected) element.hidePopover()
      })
    }
  }, [anchor, onClose])
  const commit = () =>
    choose(
      hsvToHex(
        latest.current.hsv.h,
        latest.current.hsv.s,
        latest.current.hsv.v,
        latest.current.alpha,
      ),
    )
  const setPoint = (x: number, y: number, element: HTMLElement) => {
    const rect = element.getBoundingClientRect(),
      next = {
        ...latest.current.hsv,
        s: Math.max(0, Math.min(1, (x - rect.left) / rect.width)),
        v: Math.max(0, Math.min(1, 1 - (y - rect.top) / rect.height)),
      }
    latest.current.hsv = next
    setHsv(next)
    draftColor(hsvToHex(next.h, next.s, next.v, latest.current.alpha))
  }
  function choose(color: string) {
    const normalized = normalizedColor(color)
    setHex(normalized)
    latest.current.hex = normalized
    const next = rgbToHsv(normalized.slice(0, 7)),
      a = normalized.length === 9 ? Number.parseInt(normalized.slice(7), 16) / 255 : 1
    latest.current.hsv = next
    latest.current.alpha = a
    setHsv(next)
    setAlpha(a)
    dirty.current = false
    markDirty(false)
    latest.current.onChange(color)
  }
  return (
    <div
      ref={ref}
      popover="auto"
      role="dialog"
      aria-label={`${label}颜色`}
      className="native-color-popover"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose(true)
        } else if (
          ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)
        )
          e.stopPropagation()
      }}
    >
      <header>
        <button type="button" aria-pressed={tab === 'theme'} onClick={() => setTab('theme')}>
          主题
        </button>
        <button type="button" aria-pressed={tab === 'custom'} onClick={() => setTab('custom')}>
          自定义
        </button>
        <span />
        <IconButton icon="close" label="关闭颜色选择" onClick={() => onClose(true)} />
      </header>
      {tab === 'theme' ? (
        <div className="native-color-palette">
          {palette.map((color) => (
            <button
              type="button"
              key={color}
              aria-label={`颜色 ${editorColorLabel(color)}`}
              aria-pressed={color.toLowerCase() === value.toLowerCase()}
              onClick={() => choose(color)}
            >
              <i className="native-color-swatch" style={{ background: color }} />
              <span>{editorColorLabel(color).toUpperCase()}</span>
              {color.toLowerCase() === value.toLowerCase() && (
                <span className="native-color-check">✓</span>
              )}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div
            className="native-color-saturation"
            role="slider"
            tabIndex={0}
            aria-label="饱和度和亮度"
            aria-valuetext={`饱和度 ${Math.round(hsv.s * 100)}%，亮度 ${Math.round(hsv.v * 100)}%`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(hsv.s * 100)}
            style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              setPoint(e.clientX, e.clientY, e.currentTarget)
            }}
            onPointerMove={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId))
                setPoint(e.clientX, e.clientY, e.currentTarget)
            }}
            onPointerUp={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId)
                commit()
              }
            }}
            onPointerCancel={() => {
              const normalized = normalizedColor(value)
              setHsv(rgbToHsv(normalized.slice(0, 7)))
              setHex(normalized)
              latest.current.hex = normalized
              dirty.current = false
              markDirty(false)
            }}
            onKeyDown={(e) => {
              if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
              e.preventDefault()
              const next = {
                ...hsv,
                s: Math.max(
                  0,
                  Math.min(
                    1,
                    hsv.s + (e.key === 'ArrowRight' ? 0.01 : e.key === 'ArrowLeft' ? -0.01 : 0),
                  ),
                ),
                v: Math.max(
                  0,
                  Math.min(
                    1,
                    hsv.v + (e.key === 'ArrowUp' ? 0.01 : e.key === 'ArrowDown' ? -0.01 : 0),
                  ),
                ),
              }
              setHsv(next)
              choose(hsvToHex(next.h, next.s, next.v, alpha))
            }}
          >
            <i
              style={{
                left: `${hsv.s * 100}%`,
                top: `${(1 - hsv.v) * 100}%`,
                background: hsvToHex(hsv.h, hsv.s, hsv.v, 1),
              }}
            />
          </div>
          <input
            aria-label="色相"
            className="native-color-hue"
            type="range"
            min={0}
            max={360}
            value={hsv.h}
            onChange={(e) => {
              const next = { ...hsv, h: Number(e.target.value) }
              latest.current.hsv = next
              setHsv(next)
              draftColor(hsvToHex(next.h, next.s, next.v, alpha))
            }}
            onPointerUp={commit}
            onKeyUp={(e) => {
              if (
                ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)
              )
                commit()
            }}
          />
          <input
            aria-label="颜色透明度"
            className="native-color-alpha"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={alpha}
            style={{
              background: `linear-gradient(to right,transparent,${hsvToHex(hsv.h, hsv.s, hsv.v, 1)})`,
            }}
            onChange={(e) => {
              const a = Number(e.target.value)
              latest.current.alpha = a
              setAlpha(a)
              draftColor(hsvToHex(hsv.h, hsv.s, hsv.v, a))
            }}
            onPointerUp={commit}
            onKeyUp={(e) => {
              if (
                ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)
              )
                commit()
            }}
          />
          <label className="native-color-hex">
            十六进制
            <input
              aria-label="十六进制颜色"
              value={hex}
              maxLength={9}
              onChange={(e) => draftColor(e.target.value)}
              onBlur={() => {
                if (/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(latest.current.hex)) save()
                else {
                  const normalized = normalizedColor(value)
                  setHex(normalized)
                  latest.current.hex = normalized
                  dirty.current = false
                  markDirty(false)
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
            />
          </label>
          <button type="button" className="native-color-none" onClick={() => choose('none')}>
            无颜色
          </button>
        </>
      )}
    </div>
  )
}
