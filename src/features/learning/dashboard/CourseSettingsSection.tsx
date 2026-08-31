import { Archive02Icon, Edit02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { projectLifecycleApi } from '@/features/projects/api'
import { toastAction } from '@/lib/actionToast'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import { userFacingError } from '@/lib/userFacingError'
import { cn } from '@/lib/utils'
import { learningApi } from '../api'
import type { ApiCourse, LearningSpace } from '../contracts'
import { statusLabel } from '../components/learningDisplay'

const COURSE_COLORS = [
  { label: '青绿色', value: '#2f7d5b' },
  { label: '深绿色', value: '#256447' },
  { label: '橙色', value: '#d97706' },
  { label: '蓝色', value: '#5266d6' },
  { label: '紫色', value: '#7c5cbf' },
  { label: '玫红色', value: '#b84d72' },
] as const
const DEFAULT_COURSE_COLOR = COURSE_COLORS[0].value

const LIFECYCLE_ACTIONS = {
  END: { label: '结束课程', description: '课程将停止新邀请和新学习活动。', run: projectLifecycleApi.end, destructive: false },
  ENTER_READ_ONLY: { label: '设为仅查看', description: '课程成员仍可查看内容，但不能继续修改。', run: projectLifecycleApi.enterReadOnly, destructive: false },
  ENTER_RETENTION: { label: '进入保留期', description: '课程进入保留期后，仅保留必要的历史访问。', run: projectLifecycleApi.enterRetention, destructive: false },
  ARCHIVE: { label: '归档课程', description: '课程将归档，历史内容继续保留。', run: projectLifecycleApi.archive, destructive: true },
} satisfies Record<NonNullable<LearningSpace['lifecycleAction']>, {
  label: string
  description: string
  run(projectId: string): Promise<{ ok: true; status: ApiCourse['status']; applied: boolean }>
  destructive: boolean
}>

export function CourseSettingsSection({ space }: { space: LearningSpace }) {
  const canView = space.perspective === 'teacher' && space.canManage && Boolean(space.courseId)
  const canEdit = canView && space.canUpdateCourse
  const [course, setCourse] = useState<ApiCourse | null>(null)
  const [loading, setLoading] = useState(canView)
  const [busy, setBusy] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [error, setError] = useState('')
  const [selectedColor, setSelectedColor] = useState(space.color ?? DEFAULT_COURSE_COLOR)

  useEffect(() => {
    if (!canView || !space.courseId) return
    let active = true
    setLoading(true)
    setError('')
    void learningApi.getCourse(space.courseId)
      .then((next) => {
        if (!active) return
        setCourse(next)
        setSelectedColor(next.color ?? DEFAULT_COURSE_COLOR)
      })
      .catch((reason) => { if (active) setError(userFacingError(reason, '课程设置暂时无法加载，请稍后重试。')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [canView, space.courseId])
  useEffect(() => {
    if (!canEdit) setEditOpen(false)
  }, [canEdit])

  if (!canView) return <Alert><AlertDescription>你没有查看课程设置的权限。</AlertDescription></Alert>
  if (loading) return <ResourceSkeleton variant="detail" label="正在加载课程设置" />
  if (error || !course) return <Alert variant="destructive"><AlertDescription>{error || '课程设置暂不可用。'}</AlertDescription></Alert>
  const currentColor = course.color ?? DEFAULT_COURSE_COLOR
  const lifecycleAction = course.status === space.status ? space.lifecycleAction : null
  const lifecycle = lifecycleAction ? LIFECYCLE_ACTIONS[lifecycleAction] : null

  const updateCourse = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy || !canEdit) return
    const data = new FormData(event.currentTarget)
    const name = String(data.get('name') ?? '').trim()
    const description = String(data.get('description') ?? '').trim()
    const color = selectedColor
    const confirmed = await confirmSensitiveAction({
      title: '保存课程设置？', description: '课程名称与说明将对所有课程成员更新。', confirmLabel: '保存更改', tone: 'warning',
    })
    if (!confirmed) return
    setBusy(true)
    try {
      await toastAction(learningApi.updateCourse(course.id, { name, description, color }), {
        loading: '正在保存课程设置', success: '课程设置已保存', error: '保存课程设置失败，请稍后重试',
      })
      setCourse({ ...course, name, description, color })
      setEditOpen(false)
      window.dispatchEvent(new Event('lingxiloop:learning-spaces-updated'))
    } catch { /* Toast owns the visible error state. */ }
    finally { setBusy(false) }
  }

  const advanceLifecycle = async () => {
    if (busy || !space.canManage || !lifecycle) return
    const confirmed = await confirmSensitiveAction({ title: `${lifecycle.label}？`, description: lifecycle.description, confirmLabel: lifecycle.label, tone: lifecycle.destructive ? 'destructive' : 'warning' })
    if (!confirmed) return
    setBusy(true)
    try {
      const result = await toastAction(lifecycle.run(space.projectId), {
        loading: `正在${lifecycle.label}`, success: `${lifecycle.label}成功`, error: `${lifecycle.label}失败，请稍后重试`,
      })
      setCourse({ ...course, status: result.status })
      window.dispatchEvent(new Event('lingxiloop:learning-spaces-updated'))
    } catch { /* Toast owns the visible error state. */ }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>{course.name}</CardTitle><CardDescription>{course.description || '暂无课程说明'}</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3"><Badge variant="secondary">{statusLabel(course.status)}</Badge><span className="flex items-center gap-2 text-sm text-muted-foreground"><span className="size-4 rounded-full border" style={{ backgroundColor: currentColor }} />课程颜色</span>{canEdit && <Button type="button" variant="outline" onClick={() => { setSelectedColor(currentColor); setEditOpen(true) }}><HugeiconsIcon icon={Edit02Icon} strokeWidth={2} data-icon="inline-start" />编辑课程资料</Button>}</CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>课程状态</CardTitle><CardDescription>结束或归档课程后，邀请、活动与成员访问方式会随之改变。</CardDescription></CardHeader>
        <CardContent>
          {lifecycle
            ? <Button type="button" variant={lifecycle.destructive ? 'destructive' : 'outline'} disabled={busy} onClick={() => void advanceLifecycle()}><HugeiconsIcon icon={Archive02Icon} strokeWidth={2} data-icon="inline-start" />{lifecycle.label}</Button>
            : <p className="text-sm text-muted-foreground">当前状态没有可执行的下一步。</p>}
        </CardContent>
      </Card>
      <Dialog open={canEdit && editOpen} onOpenChange={(open) => { setEditOpen(open); if (!open) setSelectedColor(currentColor) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>编辑课程资料</DialogTitle><DialogDescription>这些信息会显示给所有课程成员。</DialogDescription></DialogHeader>
          <form id="course-settings-form" onSubmit={updateCourse} className="space-y-4"><FieldGroup><Field><FieldLabel htmlFor="course-settings-name">课程名称</FieldLabel><Input id="course-settings-name" name="name" defaultValue={course.name} required /></Field><Field><FieldLabel htmlFor="course-settings-description">课程说明</FieldLabel><Textarea id="course-settings-description" name="description" defaultValue={course.description} /></Field><Field><FieldLabel>课程颜色</FieldLabel><div className="flex flex-wrap gap-3" role="group" aria-label="选择课程颜色">{[...COURSE_COLORS, ...COURSE_COLORS.some((option) => option.value === currentColor.toLowerCase()) ? [] : [{ label: '当前颜色', value: currentColor }]].map((option) => <Button key={option.value} type="button" variant="outline" size="icon" aria-label={option.label} aria-pressed={selectedColor.toLowerCase() === option.value.toLowerCase()} onClick={() => setSelectedColor(option.value)} className={cn('size-9 rounded-full border-background p-0 shadow-sm', selectedColor.toLowerCase() === option.value.toLowerCase() && 'ring-2 ring-ring ring-offset-2 ring-offset-background')} style={{ backgroundColor: option.value }}><span className="sr-only">{option.label}</span></Button>)}</div></Field></FieldGroup></form>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setEditOpen(false)}>取消</Button><Button type="submit" form="course-settings-form" disabled={busy}>保存</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
