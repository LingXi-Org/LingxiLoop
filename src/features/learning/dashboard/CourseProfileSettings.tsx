import { AvatarEditor, type AvatarInput } from '@/features/settings/AvatarEditor'
import { getCourseAvatarUrl } from '../courseAvatar'
import { useWorkspace } from '@/features/knowledge/workspace'
import { useState } from 'react'
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

  const updateCourse = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy || !canEdit) return
    const data = new FormData(event.currentTarget)
    const name = String(data.get('name') ?? '').trim()
    const description = String(data.get('description') ?? '').trim()
    const confirmed = await confirmSensitiveAction({
      title: '保存课程设置？',
      description: '课程名称与说明将对所有课程成员更新。',
      confirmLabel: '保存更改',
      tone: 'warning',
    })
    if (!confirmed) return
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
      onUpdated({ ...course, name, description, ...updated })
      void useWorkspace.getState().load()
      window.dispatchEvent(new Event('lingxiloop:learning-spaces-updated'))
    } catch {
      /* Toast owns the visible error state. */
    } finally {
      setBusy(false)
    }
  }

  const saveAvatar = async (avatar: AvatarInput) => {
    if (!canEdit || busy) throw new Error('当前课程不能修改头像。')
    const updated = await learningApi.updateCourse(course.id, { avatar })
    onUpdated({ ...course, ...updated })
    void useWorkspace.getState().load()
    window.dispatchEvent(new Event('lingxiloop:learning-spaces-updated'))
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={updateCourse} className="space-y-6">
          {!canEdit && <p className="text-sm text-muted-foreground">当前课程状态下只能查看基本资料。</p>}
          <AvatarEditor kind="course" currentUrl={course.avatarUrl || getCourseAvatarUrl(course.id)} onSave={saveAvatar} disabled={!canEdit || busy} />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="course-settings-name">课程名称</FieldLabel>
              <Input
                id="course-settings-name"
                name="name"
                defaultValue={course.name}
                disabled={!canEdit || busy}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="course-settings-description">课程说明</FieldLabel>
              <Textarea
                id="course-settings-description"
                name="description"
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
