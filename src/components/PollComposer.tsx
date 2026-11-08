import { useEffect, useRef, useState, type FormEvent } from 'react'
import { messagesApi } from '@/features/chat/api'
import { cn } from '@/lib/utils'
import { userFacingError } from '@/lib/userFacingError'

interface Props {
  onSubmitted: () => void
  onCancel: () => void
  conversationId: string
}

const MIN_OPTIONS = 2
const MAX_OPTIONS = 10
type ExpireChoice = 'none' | '1h' | '6h' | '1d' | '3d'
const EXPIRE_LABELS: Record<ExpireChoice, string> = { none: '不限', '1h': '1 小时', '6h': '6 小时', '1d': '1 天', '3d': '3 天' }

function expireToMinutes(choice: ExpireChoice): number | null {
  return { none: null, '1h': 60, '6h': 360, '1d': 1_440, '3d': 4_320 }[choice]
}

export function PollComposer({ onSubmitted, onCancel, conversationId }: Props) {
  const [question, setQuestion] = useState('')
  const [mode, setMode] = useState<'single' | 'multi'>('single')
  const [options, setOptions] = useState(['', ''])
  const [expire, setExpire] = useState<ExpireChoice>('1d')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const questionRef = useRef<HTMLInputElement | null>(null)
  const requestIdRef = useRef<string | null>(null)

  useEffect(() => { questionRef.current?.focus() }, [])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); onCancel() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  const cleanedOptions = options.map((option) => option.trim()).filter(Boolean)
  const canSubmit = question.trim().length > 0 && cleanedOptions.length >= MIN_OPTIONS && !submitting
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) { setError('请输入问题和至少两个选项。'); return }
    setSubmitting(true)
    setError(null)
    requestIdRef.current ??= crypto.randomUUID()
    void messagesApi.createPoll({
      clientRequestId: requestIdRef.current,
      conversationId,
      question: question.trim(),
      mode,
      options: cleanedOptions,
      expiresInMinutes: expireToMinutes(expire),
    }).then(() => {
      requestIdRef.current = null
      onSubmitted()
    }).catch((reason) => {
      setError(userFacingError(reason, '创建投票失败，请稍后重试。'))
      setSubmitting(false)
    })
  }

  const grip = <span aria-hidden="true" className="flex text-input"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5"><circle cx="9" cy="7" r="1" /><circle cx="15" cy="7" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="9" cy="17" r="1" /><circle cx="15" cy="17" r="1" /></svg></span>
  return (
    <form onSubmit={submit} aria-label="发起投票" className="animate-rise mx-auto mb-2 flex w-full max-w-[440px] flex-col gap-3 rounded-2xl bg-card p-4 text-foreground shadow-[0_0_0_1px_var(--border),0_1px_2px_rgb(20_20_18/4%),0_10px_28px_-10px_rgb(20_20_18/14%)]">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="grid size-6 place-items-center rounded-[7px] bg-[rgb(123_92_201/12%)] text-[#7B5CC9]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-[13px]"><path d="M4 20h16M6 16V8M12 16V4M18 16v-6" /></svg>
        </span>
        <h3 className="m-0 flex-1 text-sm font-semibold">发起投票</h3>
        <button type="button" onClick={onCancel} aria-label="取消投票" className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-4"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
      <input ref={questionRef} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="输入投票问题…" maxLength={280} aria-label="投票问题"
        className="h-9 rounded-[9px] border-0 bg-transparent px-3 text-sm shadow-[0_0_0_1px_var(--input)] outline-none placeholder:text-muted-foreground focus-visible:shadow-[0_0_0_1px_var(--brand),0_0_0_4px_var(--brand-surface)]" />
      {options.map((option, index) => (
        <div key={index} className="flex items-center gap-2">
          {grip}
          <input value={option} placeholder={`选项 ${index + 1}`} maxLength={120} aria-label={`投票选项 ${index + 1}`}
            onChange={(event) => setOptions((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.value : value))}
            className="h-8 min-w-0 flex-1 rounded-lg border-0 bg-transparent px-2.5 text-[13.5px] shadow-[0_0_0_1px_var(--border)] outline-none placeholder:text-muted-foreground focus-visible:shadow-[0_0_0_1px_var(--brand)]" />
          {options.length > MIN_OPTIONS
            ? <button type="button" onClick={() => setOptions((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`移除选项 ${index + 1}`} className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-[13px]"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
            : <span className="w-6" />}
        </div>
      ))}
      {options.length < MAX_OPTIONS && <div className="flex items-center gap-2">
        {grip}
        <button type="button" onClick={() => setOptions((current) => [...current, ''])} className="flex h-8 flex-1 items-center rounded-lg px-2.5 text-start text-[13.5px] text-muted-foreground shadow-[0_0_0_1px_var(--border)] hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-ring">添加选项</button>
        <span className="w-6" />
      </div>}
      <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-2.5 pt-1">
        <span className="text-[12.5px] text-muted-foreground">选择方式</span>
        <div role="radiogroup" aria-label="选择方式" className="flex w-40 gap-0.5 rounded-[9px] bg-accent p-[3px]">
          {(['single', 'multi'] as const).map(value => <button key={value} type="button" role="radio" aria-checked={mode === value} onClick={() => setMode(value)}
            className={cn('h-[26px] flex-1 rounded-[7px] text-[12.5px] focus-visible:outline-2 focus-visible:outline-ring', mode === value ? 'bg-card text-foreground shadow-[0_1px_2px_rgb(20_20_18/10%)]' : 'text-muted-foreground')}>{value === 'single' ? '单选' : '多选'}</button>)}
        </div>
        <span className="text-[12.5px] text-muted-foreground">有效期</span>
        <div role="radiogroup" aria-label="投票有效期" className="flex flex-wrap gap-1.5">
          {(Object.keys(EXPIRE_LABELS) as ExpireChoice[]).map((choice) => <button key={choice} type="button" role="radio" aria-checked={expire === choice} onClick={() => setExpire(choice)}
            className={cn('h-7 rounded-full px-2.5 text-[12.5px] focus-visible:outline-2 focus-visible:outline-ring', expire === choice ? 'bg-brand-surface text-brand' : 'bg-accent text-fg2')}>{EXPIRE_LABELS[choice]}</button>)}
        </div>
      </div>
      {error && <p role="alert" className="m-0 text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-1.5 pt-1">
        <button type="button" onClick={onCancel} className="h-[34px] rounded-[10px] px-3 text-[13.5px] font-medium text-fg2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">取消</button>
        <button type="submit" disabled={!canSubmit} className="h-[34px] rounded-[10px] bg-brand px-4 text-[13.5px] font-medium text-brand-foreground hover:bg-[color-mix(in_srgb,var(--brand)_90%,var(--foreground))] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50">{submitting ? '发布中…' : '发起投票'}</button>
      </div>
    </form>
  )
}
