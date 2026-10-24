import { AvatarEditor, type AvatarInput } from '@/features/settings/AvatarEditor'
import { getCourseAvatarUrl } from '../courseAvatar'
import { useWorkspace } from '@/features/knowledge/workspace'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toastAction } from '@/lib/actionToast'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import { learningApi } from '../api'
import type { ApiCourse } from '../contracts'

export function CourseProfileSettings({
  course,
  canEdit,
  onUpdated,
}: {
  course: ApiCourse
  canEdit: boolean
  onUpdated(course: ApiCourse): void
}) {
  const [busy, setBusy] = useState(false)
  const scope = JSON.stringify([course.companyId, course.projectId, course.id])
  const mounted = useRef(true)
  const current = useRef({ scope, canEdit, busy })
  current.current = { scope, canEdit, busy }
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const isCurrentCourse = () => mounted.current && current.current.scope === scope
  const canSave = () => isCurrentCourse() && current.current.canEdit

  const updateCourse = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (current.current.busy || !canSave()) return
    const data = new FormData(event.currentTarget)
    const name = String(data.get('name') ?? '').trim()
    const description = String(data.get('description') ?? '').trim()
    const confirmed = await confirmSensitiveAction({
      title: '保存课程设置？',
      description: '保存后，所有课程成员都会看到新的课程名称和说明。',
      confirmLabel: '保存更改',
      tone: 'warning',
    })
    if (!confirmed || current.current.busy || !canSave()) return
    setBusy(true)
    try {
      const updated = await toastAction(
        learningApi.updateCourse(course.id, { name, description }),
        {
          loading: '正在保存课程设置',
          success: '课程设置已保存',
          error: '保存课程设置失败，请稍后重试',
        },
      )
      if (!canSave()) return
      onUpdated({ ...course, name, description, ...updated })
      void useWorkspace.getState().load()
      window.dispatchEvent(new Event('lingxiloop:learning-spaces-updated'))
    } catch {
      /* Toast owns the visible error state. */
    } finally {
      if (isCurrentCourse()) setBusy(false)
    }
  }

  const saveAvatar = async (avatar: AvatarInput) => {
    if (!canSave() || current.current.busy) throw new Error('当前课程不能修改头像。')
    const updated = await learningApi.updateCourse(course.id, { avatar })
    if (!canSave()) return
    onUpdated({ ...course, ...updated })
    void useWorkspace.getState().load()
    window.dispatchEvent(new Event('lingxiloop:learning-spaces-updated'))
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={updateCourse} className="space-y-6">
          {!canEdit && <p className="text-sm text-muted-foreground">课程基本资料当前仅供查看。</p>}
          <AvatarEditor kind="course" currentUrl={course.avatarUrl || getCourseAvatarUrl(course.id)} onSave={saveAvatar} disabled={!canEdit || busy} />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="course-settings-name">课程名称</FieldLabel>
              <Input
                key={course.name}
                id="course-settings-name"
                name="name"
                maxLength={80}
                defaultValue={course.name}
                disabled={!canEdit || busy}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="course-settings-description">课程说明</FieldLabel>
              <Textarea
                key={course.description}
                id="course-settings-description"
                name="description"
                maxLength={1000}
                defaultValue={course.description}
                disabled={!canEdit || busy}
              />
            </Field>
          </FieldGroup>
          {canEdit && <Button type="submit" disabled={busy}>保存基本资料</Button>}
        </form>
      </CardContent>
    </Card>
  )
}
