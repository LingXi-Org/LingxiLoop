import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toastAction } from '@/lib/actionToast'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import { cn } from '@/lib/utils'
import { learningApi } from '../api'
import type { ApiCourse } from '../contracts'

const COURSE_COLORS = [
  { label: '青绿色', value: '#2f7d5b' },
  { label: '深绿色', value: '#256447' },
  { label: '橙色', value: '#d97706' },
  { label: '蓝色', value: '#5266d6' },
  { label: '紫色', value: '#7c5cbf' },
  { label: '玫红色', value: '#b84d72' },
] as const
const DEFAULT_COURSE_COLOR = COURSE_COLORS[0].value

export function CourseProfileSettings({
  course,
  canEdit,
  onUpdated,
}: {
  course: ApiCourse
  canEdit: boolean
  onUpdated(course: ApiCourse): void
}) {
  const currentColor = course.color || DEFAULT_COURSE_COLOR
  const [selectedColor, setSelectedColor] = useState(currentColor)
  const [busy, setBusy] = useState(false)

  useEffect(() => setSelectedColor(currentColor), [currentColor])

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
      await toastAction(
        learningApi.updateCourse(course.id, { name, description, color: selectedColor }),
        {
          loading: '正在保存课程设置',
          success: '课程设置已保存',
          error: '保存课程设置失败，请稍后重试',
        },
      )
      onUpdated({ ...course, name, description, color: selectedColor })
      window.dispatchEvent(new Event('lingxiloop:learning-spaces-updated'))
    } catch {
      /* Toast owns the visible error state. */
    } finally {
      setBusy(false)
    }
  }

  const colorOptions = COURSE_COLORS.some(
    (option) => option.value === currentColor.toLowerCase(),
  )
    ? COURSE_COLORS
    : [...COURSE_COLORS, { label: '当前颜色', value: currentColor }]

  return (
    <Card>
      <CardHeader>
        <CardTitle>基本资料</CardTitle>
        <CardDescription>
          {canEdit ? '这些信息会显示给所有课程成员。' : '当前课程状态下只能查看基本资料。'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={updateCourse} className="space-y-6">
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
            <Field>
              <FieldLabel>课程颜色</FieldLabel>
              <div className="flex flex-wrap gap-3" role="group" aria-label="选择课程颜色">
                {colorOptions.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={option.label}
                    aria-pressed={selectedColor.toLowerCase() === option.value.toLowerCase()}
                    disabled={!canEdit || busy}
                    onClick={() => setSelectedColor(option.value)}
                    className={cn(
                      'size-9 rounded-full border-background p-0 shadow-sm',
                      selectedColor.toLowerCase() === option.value.toLowerCase()
                        && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
                    )}
                    style={{ backgroundColor: option.value }}
                  >
                    <span className="sr-only">{option.label}</span>
                  </Button>
                ))}
              </div>
            </Field>
          </FieldGroup>
          {canEdit && <Button type="submit" disabled={busy}>保存基本资料</Button>}
        </form>
      </CardContent>
    </Card>
  )
}
