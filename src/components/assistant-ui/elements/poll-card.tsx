import { CheckIcon, VoteIcon } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { userFacingError } from '@/lib/userFacingError'
import { cn } from '@/lib/utils'
import { CardSurface, conversationCardSize } from './surfaces'

export interface PollOption { value: string; label: string; description?: string; disabled?: boolean }

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
  return <CardSurface data-slot="poll-card" aria-busy={busy} className={cn(conversationCardSize.standard, 'rounded-[6px_18px_18px_6px] p-4 text-foreground')}>
    <fieldset disabled={locked}>
      <legend className="mb-1 flex items-center gap-2 text-sm font-medium"><VoteIcon aria-hidden className="size-4 text-muted-foreground" />{title}</legend>
      <p className="mb-2 text-xs text-muted-foreground">{multiple ? '可选多项' : '请选择一项'}</p>
      <div className="divide-y divide-border">
        {options.filter(option => !submitted || value.includes(option.value)).map(option => <label key={option.value} className="flex cursor-pointer items-start gap-3 py-3 has-disabled:cursor-default">
          <input type={multiple ? 'checkbox' : 'radio'} name={name} value={option.value} checked={value.includes(option.value)} disabled={option.disabled}
            className="mt-0.5 size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            onChange={() => onChange(multiple ? value.includes(option.value) ? value.filter(item => item !== option.value) : [...value, option.value] : [option.value])} />
          <span className="min-w-0 text-sm"><span className="break-words">{option.label}</span>{option.description && <span className="mt-0.5 block text-xs text-muted-foreground">{option.description}</span>}</span>
        </label>)}
      </div>
    </fieldset>
    {submitted || closed ? <p role="status" className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><CheckIcon aria-hidden className="size-3.5" />{submitted ? '已提交投票' : '投票已结束'}</p>
      : <div className="mt-3 flex justify-end"><Button type="button" size="sm" disabled={busy || !value.length} onClick={() => void submit()}>{busy ? '正在提交' : '提交投票'}</Button></div>}
    {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
  </CardSurface>
}
