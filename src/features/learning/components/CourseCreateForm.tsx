import { useId, useRef, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { userFacingError } from '@/lib/userFacingError'
import type { ApiCourse } from '../contracts'

export interface CourseCreateInput { name: string; description: string }

export function CourseCreateForm({ create, onCreated, onBusyChange }: {
  create(input: CourseCreateInput): Promise<ApiCourse>
  onCreated(course: ApiCourse): Promise<void>
  onBusyChange?(busy: boolean): void
}) {
  const id = useId(), submitting = useRef(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [created, setCreated] = useState<ApiCourse | null>(null)
  return <form className="space-y-5" aria-busy={busy} onSubmit={async event => {
    event.preventDefault()
    if (submitting.current) return
    const values = new FormData(event.currentTarget), name = String(values.get('name') ?? '').trim()
    if (!name) { setError('请填写课程名称。'); return }
    submitting.current = true; setBusy(true); onBusyChange?.(true); setError('')
    try {
      const course = created ?? await create({ name, description: String(values.get('description') ?? '').trim() })
      setCreated(course)
      await onCreated(course)
    } catch (reason) { setError(userFacingError(reason, '暂时无法完成，请稍后重试。')) }
    finally { submitting.current = false; setBusy(false); onBusyChange?.(false) }
  }}>
    <FieldGroup>
      <Field><FieldLabel htmlFor={`${id}-name`}>课程名称</FieldLabel><Input id={`${id}-name`} name="name" required maxLength={80} autoFocus readOnly={busy || Boolean(created)} placeholder="例如：高一数学" /></Field>
      <Field><FieldLabel htmlFor={`${id}-description`}>课程简介（选填）</FieldLabel><Textarea id={`${id}-description`} name="description" maxLength={1000} readOnly={busy || Boolean(created)} placeholder="介绍课程内容，之后也可以修改" /></Field>
    </FieldGroup>
    {error && <Alert variant="destructive"><AlertDescription>{created ? '课程已创建，请重试继续。' : ''}{error}</AlertDescription></Alert>}
    <Button type="submit" className="min-h-11" disabled={busy}>{busy ? '正在准备课程…' : created ? '继续进入课程' : '创建课程'}</Button>
  </form>
}
