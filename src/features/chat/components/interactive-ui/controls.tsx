import { useContext, useId } from 'react'
import { useTriggerAction, type StateField } from '@openuidev/react-lang'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { InteractiveContext } from './context'

export function Parameter({ label, field, min, max, step, unit }: {
  label: string; field: StateField<number>; min: number; max: number; step: number; unit: string
}) {
  const id = useId(), { disabled } = useContext(InteractiveContext)
  return <div className="grid min-w-0 gap-2">
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <Label id={id}>{label}</Label><output className="text-sm tabular-nums">{field.value} {unit}</output>
    </div>
    <Slider aria-labelledby={id} aria-valuetext={`${field.value} ${unit}`} value={[field.value]} min={min} max={max} step={step}
      disabled={disabled} className="min-h-8 motion-reduce:[&_*]:transition-none" onValueChange={values => {
        if (!disabled && Number.isFinite(values[0]) && values[0] >= min && values[0] <= max) field.setValue(values[0])
      }} />
  </div>
}

export function Choice({ label, field, options }: {
  label: string; field: StateField<string>; options: string[]
}) {
  const id = useId(), { disabled } = useContext(InteractiveContext)
  return <div className="grid min-w-0 gap-2"><Label htmlFor={id}>{label}</Label>
    <Select value={field.value} disabled={disabled} onValueChange={next => {
      if (!disabled && options.includes(next)) field.setValue(next)
    }}><SelectTrigger id={id} className="w-full min-w-0"><SelectValue /></SelectTrigger>
      <SelectContent>{options.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
    </Select>
  </div>
}

export function Toggle({ label, field }: { label: string; field: StateField<boolean> }) {
  const id = useId(), { disabled } = useContext(InteractiveContext)
  return <div className="flex min-w-0 items-center gap-2"><Checkbox id={id} disabled={disabled} checked={field.value}
    onCheckedChange={next => { if (!disabled && typeof next === 'boolean') field.setValue(next) }} /><Label htmlFor={id}>{label}</Label></div>
}

export function Prediction({ label, field }: { label: string; field: StateField<string> }) {
  const id = useId(), { disabled } = useContext(InteractiveContext)
  return <div className="grid min-w-0 gap-2"><Label htmlFor={id}>{label}</Label>
    <Input id={id} value={field.value} disabled={disabled} maxLength={1000} onChange={event => {
      if (!disabled) field.setValue(event.target.value)
    }} />
  </div>
}

export function Steps({ title, field, steps }: {
  title: string; field: StateField<number>; steps: Array<{ title: string; text: string }>
}) {
  const { disabled } = useContext(InteractiveContext)
  const index = Math.max(0, Math.min(steps.length - 1, Math.trunc(field.value))), count = index + 1
  return <section className="grid min-w-0 gap-3" aria-label={title}>
    <h4 className="font-medium">{title}</h4>
    <ol className="grid list-decimal gap-3 ps-5">{steps.slice(0, count).map((step, index) => <li key={index} className="ps-1">
      <p className="font-medium">{step.title}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{step.text}</p>
    </li>)}</ol>
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" disabled={disabled || index <= 0} onClick={() => field.setValue(index - 1)}>上一步</Button>
      <Button type="button" variant="outline" size="sm" disabled={disabled || count >= steps.length} onClick={() => field.setValue(index + 1)}>下一步</Button>
      <span className="text-xs text-muted-foreground">{count} / {steps.length}</span>
    </div>
  </section>
}

export function Action({ actionId, label }: { actionId: string; label: string }) {
  const trigger = useTriggerAction(), { actionsDisabled } = useContext(InteractiveContext)
  return <Button type="button" size="sm" disabled={actionsDisabled} className="h-auto min-h-9 max-w-full whitespace-normal break-words py-2"
    onClick={() => { if (!actionsDisabled) void trigger(label, undefined, { type: 'interaction', params: { actionId } }) }}>{label}</Button>
}
