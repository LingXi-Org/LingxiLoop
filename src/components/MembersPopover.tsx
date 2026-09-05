/**
 * Floating popover that lists every member of a conversation. Anchored to a
 * trigger element via DOMRect; closes on outside click / Esc. Click any row
 * to pin that person's profile in the InfoPane.
 */
import { useEffect, useRef, type RefObject } from 'react'
import { Avatar } from './Avatar'
import { HumanBadge } from './HumanBadge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Item, ItemContent, ItemGroup, ItemMedia, ItemTitle, ItemDescription } from '@/components/ui/item'
import { useSurface } from '@/stores/surface'
import { useMe } from '@/stores/auth'
import { participantRoleZh } from '@/lib/participantRole'
import type { Participant } from '@/types'

const STATUS_LABEL: Record<string, string> = {
  avail: '可用', working: '工作中', thinking: '思考中', waiting: '等待你确认', resting: '休息中',
}
const STATUS_COLOR: Record<string, string> = {
  avail: 'var(--avail)', working: 'var(--working)', thinking: 'var(--thinking)', waiting: 'var(--waiting)', resting: 'var(--resting)',
}

interface Props {
  members: Participant[]
  /** anchor rect (e.g. from getBoundingClientRect of the trigger) */
  anchor: DOMRect
  /** trigger element that should not count as an outside click */
  triggerRef?: RefObject<HTMLElement>
  onClose: () => void
}

export function MembersPopover({ members, anchor, triggerRef, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const openInfo = useSurface((s) => s.openAgentInfo)
  const meId = useMe()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef?.current?.contains(target)) return
      if (!ref.current) return
      if (!ref.current.contains(target)) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown, true)
    }
  }, [onClose, triggerRef])

  // Position: just below the anchor, right-edge aligned with the anchor.
  // Clamped to viewport in a layout effect.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = anchor.right - r.width
    let top = anchor.bottom + 6
    if (left < 8) left = 8
    if (left + r.width > vw - 8) left = vw - r.width - 8
    if (top + r.height > vh - 8) top = anchor.top - r.height - 6  // flip above
    el.style.left = `${left}px`
    el.style.top = `${top}px`
  }, [anchor])

  const sorted = [...members].sort((a, b) => {
    // Humans on top, then agents alphabetical.
    if (a.kind !== b.kind) return a.kind === 'human' ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="对话成员"
      className="fixed z-[60] w-[280px] py-1 rounded-[12px] bg-cloud animate-rise"
      style={{
        left: anchor.right - 280,
        top: anchor.bottom + 6,
        boxShadow: '0 12px 32px -10px color-mix(in srgb, var(--foreground) 22%, transparent), 0 6px 14px -6px color-mix(in srgb, var(--foreground) 14%, transparent), 0 0 0 1px color-mix(in srgb, var(--border) 80%, transparent)',
      }}
    >
      <div className="px-3 pt-2 pb-1.5 text-[10.5px] font-bold tracking-[0.12em] uppercase text-ink-300">
        {members.length} {members.length === 1 ? "成员" : "成员"}
      </div>
      <ScrollArea style={{ height: Math.min(sorted.length * 48, 400), maxHeight: 'calc(100vh - 96px)' }}>
        <ItemGroup className="gap-0 py-0.5">
        {sorted.map((p) => {
          const isYou = p.id === meId
          const roleLabel = participantRoleZh(p)
          return (
            <Item
              key={p.id}
              role={isYou ? undefined : 'button'}
              tabIndex={isYou ? undefined : 0}
              size="xs"
              onClick={() => {
                if (!isYou) openInfo(p.id)
                onClose()
              }}
              onKeyDown={(event) => {
                if (isYou || (event.key !== 'Enter' && event.key !== ' ')) return
                event.preventDefault(); openInfo(p.id); onClose()
              }}
              aria-disabled={isYou || undefined}
              className="flex-nowrap rounded-none border-0 px-3 py-2 hover:bg-sky2-50 aria-disabled:cursor-default aria-disabled:hover:bg-transparent"
            >
              <ItemMedia><Avatar p={p} size={32} ringColor="var(--cloud)" /></ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle className="flex w-full items-center gap-1.5">
                  <span className="text-[13px] font-semibold text-ink-900 truncate">{p.name}</span>
                  {isYou && <span className="text-[9.5px] font-bold py-px px-1.5 rounded uppercase tracking-wider bg-sky2-100 text-skype-deep">你</span>}
                  {!isYou && p.kind === 'human' && <HumanBadge />}
                </ItemTitle>
                <ItemDescription className="flex items-center gap-1.5 truncate text-[11.5px] text-ink-500">
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full"
                    style={{ background: STATUS_COLOR[p.status] ?? 'var(--resting)' }}
                  />
                  {STATUS_LABEL[p.status] ?? '空闲'}
                  {roleLabel && <><span className="text-ink-300">·</span><em className="not-italic font-display italic">{roleLabel}</em></>}
                </ItemDescription>
              </ItemContent>
            </Item>
          )
        })}
        </ItemGroup>
      </ScrollArea>
    </div>
  )
}
