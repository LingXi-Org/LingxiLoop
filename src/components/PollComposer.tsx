import { useEffect, useRef, useState, type FormEvent } from 'react'
import { BarChart3Icon, PlusIcon, XIcon } from 'lucide-react'
import { messagesApi } from '@/api/messages'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoiceDescription,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireError,
  QuestionnaireItem,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from '@/components/ui/questionnaire'
import { cn } from '@/lib/utils'

interface Props {
  onSubmitted: () => void
  onCancel: () => void
  conversationId: string
}

const MIN_OPTIONS = 2
const MAX_OPTIONS = 10
type ExpireChoice = 'none' | '1h' | '6h' | '1d' | '3d'
const EXPIRE_LABELS: Record<ExpireChoice, string> = { none: '不限', '1h': '1 小时', '6h': '6 小时', '1d': '1 天', '3d': '3 天' }
const MODE_ITEMS = [{ name: 'mode', required: true, choices: [{ value: 'single' }, { value: 'multi' }] }]

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
    void messagesApi.createPoll({
      conversationId,
      question: question.trim(),
      mode,
      options: cleanedOptions,
      expiresInMinutes: expireToMinutes(expire),
    }).then(onSubmitted).catch((reason) => {
      setError(reason instanceof Error ? reason.message : '创建投票失败')
      setSubmitting(false)
    })
  }

  return (
    <Questionnaire items={MODE_ITEMS} defaultItem="mode" onSubmit={submit} className="mb-2 animate-rise">
      <Card className="w-full" size="sm">
        <CardHeader className="grid-cols-[1fr_auto]">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary"><BarChart3Icon className="size-4" /></span>
            <CardTitle>新建投票</CardTitle>
          </div>
          <Button type="button" variant="ghost" size="icon-xs" onClick={onCancel} aria-label="取消投票"><XIcon /></Button>
        </CardHeader>
        <CardContent>
          <QuestionnaireItem name="mode" required>
            <QuestionnaireTitle>投票内容</QuestionnaireTitle>
            <QuestionnaireDescription>输入问题和选项，并选择参与者可以提交一个还是多个答案。</QuestionnaireDescription>
            <div className="grid gap-2">
              <Input ref={questionRef} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="输入投票问题…" maxLength={280} aria-label="投票问题" />
              {options.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={option}
                    onChange={(event) => setOptions((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.value : value))}
                    placeholder={`选项 ${index + 1}`}
                    maxLength={120}
                    aria-label={`投票选项 ${index + 1}`}
                  />
                  {options.length > MIN_OPTIONS ? (
                    <Button type="button" variant="ghost" size="icon-xs" onClick={() => setOptions((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`移除选项 ${index + 1}`}><XIcon /></Button>
                  ) : null}
                </div>
              ))}
              {options.length < MAX_OPTIONS ? (
                <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => setOptions((current) => [...current, ''])}><PlusIcon />添加选项</Button>
              ) : null}
            </div>
            <QuestionnaireChoices className="grid-cols-2">
              <QuestionnaireChoice value="single" checked={mode === 'single'} onChange={() => setMode('single')}>
                <span>单选</span><QuestionnaireChoiceDescription>每人选择一个答案</QuestionnaireChoiceDescription>
              </QuestionnaireChoice>
              <QuestionnaireChoice value="multi" checked={mode === 'multi'} onChange={() => setMode('multi')}>
                <span>多选</span><QuestionnaireChoiceDescription>每人可以选择多个答案</QuestionnaireChoiceDescription>
              </QuestionnaireChoice>
            </QuestionnaireChoices>
            <div className="flex flex-wrap items-center gap-1.5" aria-label="投票有效期">
              <span className="mr-1 text-xs text-muted-foreground">有效期</span>
              {(Object.keys(EXPIRE_LABELS) as ExpireChoice[]).map((choice) => (
                <Button key={choice} type="button" size="xs" variant={expire === choice ? 'default' : 'outline'} onClick={() => setExpire(choice)}>{EXPIRE_LABELS[choice]}</Button>
              ))}
            </div>
            <QuestionnaireError>{error ?? '请选择投票模式。'}</QuestionnaireError>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </QuestionnaireItem>
        </CardContent>
        <CardFooter className="justify-end">
          <QuestionnaireActions className="min-h-0 w-auto grid-cols-[auto_auto]">
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>取消</Button>
            <QuestionnaireSubmit className={cn('col-start-2', !canSubmit && 'opacity-50')} size="sm" disabled={!canSubmit}>
              {submitting ? '发布中…' : '发起投票'}
            </QuestionnaireSubmit>
          </QuestionnaireActions>
        </CardFooter>
      </Card>
    </Questionnaire>
  )
}
