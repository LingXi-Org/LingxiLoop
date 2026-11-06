import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const GLYPHS = {
  handoff: <><path d="M6 3v12a3 3 0 0 0 3 3h9" /><path d="m15 15 3 3-3 3" /></>,
  email: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  learning: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" /><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" /></>,
  visualize: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 15l3-3 3 3 4-5" /></>,
} as const

/** Retired or historical records (归档与停用): read-only, quiet, but legible. */
export function ArchiveNote({ kind, title, tag, children, className }: {
  kind: keyof typeof GLYPHS; title: ReactNode; tag: string; children?: ReactNode; className?: string
}) {
  return <section data-slot="archive-note" data-archive-kind={kind} className={cn('flex w-full max-w-[620px] gap-3 rounded-xl bg-formula px-3.5 py-3', className)}>
    <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-[7px] bg-[rgb(86_96_108/12%)] text-[#56606C] dark:text-[#A9B1BC]">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">{GLYPHS[kind]}</svg>
    </span>
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="min-w-0 text-[13.5px] font-medium [overflow-wrap:anywhere]">{title}</span>
        <span className="h-[18px] shrink-0 rounded-full bg-[rgb(86_96_108/10%)] px-1.5 text-[11px] leading-[18px] text-[#56606C] dark:text-[#A9B1BC]">{tag}</span>
      </div>
      {children}
    </div>
  </section>
}

export function ArchiveFields({ fields }: { fields: { label: string; value: string }[] }) {
  if (!fields.length) return null
  return <dl className="m-0 grid grid-cols-[40px_minmax(0,1fr)] gap-x-2.5 gap-y-[3px] text-[12.5px] leading-[1.6]">
    {fields.map(field => <div key={field.label} className="contents"><dt className="text-muted-foreground">{field.label}</dt><dd className="m-0 whitespace-pre-wrap break-words text-fg2">{field.value}</dd></div>)}
  </dl>
}
