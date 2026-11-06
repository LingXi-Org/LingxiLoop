import { CheckIcon, XIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface ProgressStep {
  id: string
  label: string
  status: 'pending' | 'running' | 'complete' | 'failed' | 'stopped'
  detail?: ReactNode
}

const statusLabels = { pending: '等待处理', running: '进行中', complete: '已完成', failed: '失败', stopped: '已停止' }

/** Tool activity (高频组件 · 5): segmented progress and 16px step marks; quiet grey once stopped. */
export function ProgressCard({ title, steps, children }: { title: string; steps: ProgressStep[]; children?: ReactNode }) {
  const stopped = steps.some(step => step.status === 'stopped')
  const done = steps.filter(step => step.status === 'complete').length
  const accent = stopped ? '#6B6B66' : '#7B5CC9'
  return <section data-slot="progress-card" aria-label={title} className={cn('lx-card flex w-full max-w-[620px] flex-col gap-2.5 px-[18px] py-4 text-foreground', stopped && 'opacity-[.85]')}>
    <div className="flex items-center gap-2">
      <span aria-hidden className="grid size-[22px] place-items-center rounded-[7px]" style={{ background: `color-mix(in srgb, ${accent} 12%, transparent)`, color: accent }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-3"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
      </span>
      <h3 className={cn('m-0 flex-1 text-sm font-semibold', stopped && 'text-fg2')}>{title}</h3>
      <span className="text-xs tabular-nums" style={{ color: stopped ? 'var(--muted-foreground)' : accent }}>{stopped ? '已停止' : `${done} / ${steps.length}`}</span>
    </div>
    {!stopped && <div aria-hidden className="flex gap-[3px]">
      {steps.map(step => <span key={step.id} className="h-1 flex-1 rounded-sm" style={{ background: step.status === 'complete' ? accent : step.status === 'failed' ? '#C8463B' : `color-mix(in srgb, ${accent} 15%, transparent)` }} />)}
    </div>}
    <ol className="m-0 flex list-none flex-col p-0 pt-0.5">
      {steps.map(step => <li key={step.id} aria-current={step.status === 'running' ? 'step' : undefined} className="flex min-w-0 gap-2.5 py-1.5">
        <StepMark status={step.status} accent={accent} size={16} />
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className={cn('text-[13px]', step.status === 'running' ? 'font-medium text-foreground' : step.status === 'complete' ? 'text-fg2' : 'text-foreground')}>{step.label}</span>
          {step.detail && <span className="break-words text-xs text-muted-foreground">{step.detail}</span>}
        </span>
        <span className="shrink-0 text-[11.5px]" style={{ color: step.status === 'running' ? accent : step.status === 'failed' ? '#C8463B' : 'var(--muted-foreground)' }}>{statusLabels[step.status]}</span>
      </li>)}
    </ol>
    {children}
  </section>
}

function StepMark({ status, accent, size }: { status: ProgressStep['status']; accent: string; size: 16 | 24 }) {
  const box = { width: size, height: size }
  if (status === 'complete') return <span aria-hidden className="grid shrink-0 place-items-center rounded-full text-white" style={{ ...box, background: accent }}><CheckIcon strokeWidth={3} className={size === 16 ? 'size-2.5' : 'size-3.5'} /></span>
  if (status === 'failed') return <span aria-hidden className="grid shrink-0 place-items-center rounded-full bg-[#C8463B] text-white" style={box}><XIcon strokeWidth={3} className={size === 16 ? 'size-2.5' : 'size-3.5'} /></span>
  if (status === 'running') return <span aria-hidden className="shrink-0 rounded-full border-2 motion-safe:animate-spin" style={{ ...box, borderColor: `color-mix(in srgb, ${accent} 22%, transparent)`, borderTopColor: accent, borderRightColor: accent, boxShadow: size === 24 ? `0 0 0 4px color-mix(in srgb, ${accent} 14%, transparent)` : undefined }} />
  if (status === 'stopped') return <span aria-hidden className="grid shrink-0 place-items-center rounded-full border-[1.5px] border-input" style={box}><i className="size-1.5 rounded-[1px] bg-muted-foreground" /></span>
  return <span aria-hidden className="shrink-0 rounded-full border-[1.5px] border-dashed border-input" style={box} />
}

export interface GenerationStep { id: string; label: string; description?: string; status: 'pending' | 'in-progress' | 'completed' | 'failed' }

/** Board / deck generation (高频组件 · 6): green timeline with a running ring; red one-line card when interrupted. */
export function GenerationProgress({ title, subtitle, steps, elapsed, outcome }: {
  title: string; subtitle?: string; steps: GenerationStep[]; elapsed?: string
  outcome?: { kind: 'success' | 'failed' | 'partial' | 'cancelled'; summary: string }
}) {
  const failedAt = steps.findIndex(step => step.status === 'failed')
  if (outcome && outcome.kind !== 'success' || failedAt >= 0) {
    const saved = steps.filter(step => step.status === 'completed').length
    return <section data-slot="progress-tracker" data-outcome={outcome?.kind ?? 'failed'} aria-label={title}
      className="flex w-full max-w-[620px] items-center gap-2.5 rounded-2xl bg-card px-5 py-3.5 shadow-[0_0_0_1px_rgb(200_70_59/22%),0_10px_28px_-12px_rgb(200_70_59/20%)]">
      <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-[7px] bg-[rgb(200_70_59/12%)] text-[#C8463B]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-3.5"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13.5px] font-medium">{failedAt >= 0 ? `${title}在「${steps[failedAt]!.label}」中断` : `${title} · ${outcome!.summary}`}</span>
        <span className="text-xs text-muted-foreground">{saved ? `已完成的 ${saved} 步已保存` : subtitle ?? '可以稍后重新发起'}</span>
      </span>
      {elapsed && <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground">{elapsed}</span>}
    </section>
  }
  const done = steps.filter(step => step.status === 'completed').length
  return <section data-slot="progress-tracker" aria-label={title}
    className="flex w-full max-w-[620px] flex-col gap-3 rounded-2xl bg-card px-5 py-[18px] shadow-[0_0_0_1px_var(--border),0_1px_2px_rgb(20_20_18/4%),0_10px_28px_-10px_rgb(20_20_18/14%)]">
    <div className="flex items-center gap-2.5">
      <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-[7px] bg-brand-surface text-brand">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-3.5"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 8h6M7 12h10M7 16h4" /></svg>
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold">{outcome ? outcome.summary : title}</span>
        {subtitle && <span className="truncate text-xs text-muted-foreground">{subtitle}</span>}
      </span>
      {elapsed && <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground">{elapsed}</span>}
    </div>
    <div aria-hidden className="flex gap-[3px]">{steps.map(step => <span key={step.id} className={cn('h-1 flex-1 rounded-sm', step.status === 'completed' ? 'bg-brand' : 'bg-[color-mix(in_srgb,var(--brand)_15%,transparent)]')} />)}</div>
    <ol className="m-0 flex list-none flex-col p-0 pt-1" aria-label={`${done} / ${steps.length} 步已完成`}>
      {steps.map((step, index) => <li key={step.id} className="relative pb-1.5">
        {index < steps.length - 1 && <span aria-hidden className={cn('absolute start-[11px] top-7 -bottom-0.5 w-0.5 rounded-[1px]', step.status === 'completed' ? 'bg-brand' : 'bg-border')} />}
        <div className="flex gap-2.5 py-1.5">
          <StepMark status={step.status === 'completed' ? 'complete' : step.status === 'in-progress' ? 'running' : 'pending'} accent="var(--brand)" size={24} />
          <span className="flex min-w-0 flex-1 flex-col gap-px">
            <span className={cn('text-[13px]', step.status === 'in-progress' ? 'font-medium text-foreground' : step.status === 'completed' ? 'text-fg2' : 'text-foreground')}>{step.label}</span>
            {step.description && <span className="text-xs text-muted-foreground">{step.description}</span>}
          </span>
          <span className={cn('shrink-0 text-[11.5px]', step.status === 'in-progress' ? 'text-brand' : 'text-muted-foreground')}>{step.status === 'completed' ? '已完成' : step.status === 'in-progress' ? '进行中' : '等待处理'}</span>
        </div>
      </li>)}
    </ol>
  </section>
}
