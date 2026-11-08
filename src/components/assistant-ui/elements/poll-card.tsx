import { CheckIcon } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { userFacingError } from '@/lib/userFacingError'
import { cn } from '@/lib/utils'
import { ActionTicket, ticketPrimary } from './approval-card'

export interface PollOption { value: string; label: string; description?: string; disabled?: boolean }

const pollIcon = <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-3.5"><path d="M4 20h16M6 16V8M12 16V4M18 16v-6" /></svg>

export function PollCard({ title, options, multiple, value, submitted, closed, onChange, onSubmit }: {
  title: string; options: PollOption[]; multiple: boolean; value: string[]; submitted: boolean; closed: boolean
  onChange: (value: string[]) => void; onSubmit: () => unknown | Promise<unknown>
}) {
  const name = useId()
  const submitting = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const locked = closed || submitted || busy
  async function submit() {
    if (locked || !value.length || submitting.current) return
    submitting.current = true; setBusy(true); setError(null)
    try { await onSubmit() }
    catch (cause) { setError(userFacingError(cause, '投票提交失败，请重试。')) }
    finally { submitting.current = false; setBusy(false) }
  }
  const visible = options.filter(option => !submitted || value.includes(option.value))
  return <div data-slot="poll-card" aria-busy={busy} className="w-full max-w-[640px]">
    <ActionTicket kind={<>{pollIcon}投票 · {multiple ? '多选' : '单选'}{closed ? ' · 已结束' : ''}</>} title={title}
      status={submitted ? <span className="text-xs text-brand">已投</span> : undefined}
      footer={submitted || closed
        ? <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><CheckIcon aria-hidden className="size-3.5" />{submitted ? '已提交投票' : '投票已结束'}</p>
        : <><span className="flex-1">{error && <span role="alert" className="text-xs text-destructive">{error}</span>}</span>
          <button type="button" className={ticketPrimary} disabled={busy || !value.length} onClick={() => void submit()}>{busy ? '正在提交' : '提交投票'}</button></>}>
      <fieldset disabled={locked} className="m-0 grid min-w-0 gap-2 border-0 p-0 pb-2.5">
        <legend className="sr-only">{title}</legend>
        {visible.map((option, index) => {
          const active = value.includes(option.value)
          return <label key={option.value} className={cn('flex min-h-10 min-w-0 cursor-pointer items-center gap-2 rounded-[10px] px-2.5 py-2 has-disabled:cursor-default has-focus-visible:outline-2 has-focus-visible:outline-ring',
            active ? 'bg-brand text-brand-foreground' : 'shadow-[inset_0_0_0_1px_var(--border)] hover:bg-accent/50')}>
            <input type={multiple ? 'checkbox' : 'radio'} name={name} value={option.value} checked={active} disabled={option.disabled} className="sr-only"
              onChange={() => onChange(multiple ? active ? value.filter(item => item !== option.value) : [...value, option.value] : [option.value])} />
            <span aria-hidden="true" className={cn('grid size-5 shrink-0 place-items-center rounded-[5px] font-mono text-[11px]', active ? 'bg-white/20 text-white' : 'bg-formula text-muted-foreground')}>{String.fromCharCode(65 + index)}</span>
            <span className="min-w-0 text-[13px]"><span className="break-words">{option.label}</span>{option.description && <span className={cn('mt-0.5 block text-xs', active ? 'text-white/75' : 'text-muted-foreground')}>{option.description}</span>}</span>
          </label>
        })}
      </fieldset>
    </ActionTicket>
  </div>
}
