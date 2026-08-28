import type { ReactNode } from 'react'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'

function OpenFullIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M14 4h6v6" />
      <path d="M20 4l-9 9" />
      <path d="M20 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

export function PeekHeader({
  icon,
  label,
  title,
  meta,
  onClose,
  onOpenFull,
}: {
  icon: ReactNode
  label: string
  title: string
  meta?: string
  onClose: () => void
  onOpenFull?: () => void
}) {
  return (
    <header className="shrink-0 border-b border-ink-100 bg-gradient-to-b from-white to-sky2-50/35 px-4 py-3">
      <div className="flex items-start gap-3 min-w-0">
        <div className="mt-0.5 h-9 w-9 shrink-0 rounded-[10px] grid place-items-center bg-cloud border border-ink-100 text-skype-deep">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">{label}</div>
          <h2 className="mt-0.5 truncate text-[16px] font-semibold leading-[1.25] text-ink-900">{title}</h2>
          {meta && <div className="mt-1 truncate text-[11.5px] text-ink-500">{meta}</div>}
        </div>
        {onOpenFull && (
          <button
            type="button"
            onClick={onOpenFull}
            className="h-8 w-8 rounded-[8px] grid place-items-center text-ink-500 hover:text-skype-deep hover:bg-sky2-100 transition"
            title="打开完整工作区"
            aria-label="打开完整工作区"
          >
            <OpenFullIcon />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="h-8 w-8 rounded-[8px] grid place-items-center text-ink-400 hover:text-ink-900 hover:bg-ink-100/70 transition"
          title="关闭"
          aria-label="关闭"
        >
          <CloseIcon />
        </button>
      </div>
    </header>
  )
}

export function PeekLoading({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="relative h-full bg-cloud">
      <ResourceSkeleton variant="detail" className="h-full" label={label} />
      <div className="pointer-events-none absolute left-4 top-4 grid size-10 place-items-center text-skype-deep" aria-hidden>{icon}</div>
    </div>
  )
}

export function PeekUnavailable({
  icon,
  title,
  detail,
  onClose,
}: {
  icon: ReactNode
  title: string
  detail: string
  onClose: () => void
}) {
  return (
    <div className="h-full bg-cloud grid place-items-center px-8 text-center">
      <div className="max-w-[280px]">
        <div className="mx-auto w-12 h-12 rounded-[12px] grid place-items-center bg-coral-soft/45 text-coral-deep">
          {icon}
        </div>
        <div className="mt-3 text-[14px] font-semibold text-ink-900">{title}</div>
        <div className="mt-1 text-[12px] text-ink-500 leading-relaxed">{detail}</div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 h-8 px-3 rounded-[8px] text-[12px] font-semibold text-ink-600 border border-ink-100 hover:bg-sky2-50 transition"
        >
          关闭
        </button>
      </div>
    </div>
  )
}

export function formatShortDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '最近'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
