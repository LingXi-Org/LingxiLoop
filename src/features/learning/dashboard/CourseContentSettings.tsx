import { useCallback, useEffect, useState } from 'react'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toastAction } from '@/lib/actionToast'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import { userFacingError } from '@/lib/userFacingError'
import { learningApi } from '../api'
import { LearningActivitiesSection } from '../components/LearningActivitiesSection'
import { LearningObjectivesSection } from '../components/LearningObjectivesSection'
import {
  ACTIVITY_TYPE_LABELS,
  EVALUATION_MODE_LABELS,
} from '../components/learningDisplay'
import type {
  LearningActivity,
  LearningCourse,
  LearningObjective,
  LearningSpace,
} from '../contracts'

const ACTIVITY_TYPES: LearningActivity['kind'][] = [
  'LESSON',
  'PRACTICE',
  'ASSESSMENT',
  'PROJECT',
  'REVIEW',
]
const EVALUATION_MODES: LearningActivity['evaluationMode'][] = [
  'AGENT_FORMATIVE',
  'TEACHER_REQUIRED',
]

function ObjectiveCheckboxes({
  objectives,
  name,
  idPrefix,
  emptyLabel,
}: {
  objectives: LearningObjective[]
  name: 'prerequisiteIds' | 'objectiveIds'
  idPrefix: string
  emptyLabel: string
}) {
  const available = objectives.filter((objective) => objective.status !== 'ARCHIVED')
  if (available.length === 0) return <p className="text-sm text-muted-foreground">{emptyLabel}</p>
  return (
    <div className="grid gap-3 @min-[36rem]/learning-grid:grid-cols-2">
      {available.map((objective) => {
        const id = `${idPrefix}-${objective.id}`
        return (
          <FieldLabel key={objective.id} htmlFor={id} className="items-center rounded-2xl border p-3">
            <Checkbox id={id} name={name} value={objective.id} />
            <span className="min-w-0 break-words">{objective.title}</span>
          </FieldLabel>
        )
      })}
    </div>
  )
}

export function CourseContentSettings({ space }: { space: LearningSpace }) {
  const canView = space.perspective === 'teacher' && space.canManage && Boolean(space.courseId)
  const canEdit = canView && space.canEditContent
  const [objectives, setObjectives] = useState<LearningObjective[]>([])
  const [activities, setActivities] = useState<LearningActivity[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(canView)
  const [busy, setBusy] = useState(false)
  const [objectiveOpen, setObjectiveOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!canView) return
    setLoading(true)
    setError('')
    try {
      const [nextObjectives, nextActivities] = await Promise.all([
        learningApi.listKnowledgeUnits(space.projectId),
        learningApi.listActivities(space.projectId),
      ])
      setObjectives(nextObjectives)
      setActivities(nextActivities)
    } catch (reason) {
      setError(userFacingError(reason, '课程内容暂时无法加载，请稍后重试。'))
    } finally {
      setLoading(false)
    }
  }, [canView, space.projectId])

  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    if (!canEdit) {
      setObjectiveOpen(false)
      setActivityOpen(false)
    }
  }, [canEdit])

  if (!canView) {
    return <Alert><AlertDescription>你没有管理课程内容的权限。</AlertDescription></Alert>
  }

  const createObjective = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy || !canEdit || !space.courseId) return
    const form = event.currentTarget
    const data = new FormData(form)
    const title = String(data.get('title') ?? '').trim()
    const confirmed = await confirmSensitiveAction({
      title: '创建学习目标？',
      description: `“${title}”将先保存为草稿。`,
      confirmLabel: '创建目标',
      tone: 'warning',
    })
    if (!confirmed) return
    setBusy(true)
    try {
      await toastAction(
        learningApi.createObjectives(space.courseId, [{
          title,
          successCriteria: String(data.get('successCriteria') ?? '').trim(),
          targetLevel: Number(data.get('targetLevel') ?? 2),
          prerequisiteIds: data.getAll('prerequisiteIds').map(String),
        }]),
        {
          loading: '正在创建学习目标',
          success: '学习目标已创建',
          error: '创建学习目标失败，请稍后重试',
        },
      )
      setObjectiveOpen(false)
      form.reset()
      await load()
    } catch {
      /* Toast owns the visible error state. */
    } finally {
      setBusy(false)
    }
  }

  const createActivity = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy || !canEdit || !space.courseId) return
    const form = event.currentTarget
    const data = new FormData(form)
    const title = String(data.get('title') ?? '').trim()
    const dueAt = String(data.get('dueAt') ?? '')
    const confirmed = await confirmSensitiveAction({
      title: '创建学习活动？',
      description: `“${title}”将先保存为草稿。`,
      confirmLabel: '创建活动',
      tone: 'warning',
    })
    if (!confirmed) return
    setBusy(true)
    try {
      await toastAction(
        learningApi.createActivity(space.courseId, {
          title,
          instructions: String(data.get('instructions') ?? '').trim(),
          type: String(data.get('type') ?? 'LESSON') as LearningActivity['kind'],
          evaluationMode: String(
            data.get('evaluationMode') ?? 'TEACHER_REQUIRED',
          ) as LearningActivity['evaluationMode'],
          targetLevel: Number(data.get('targetLevel') ?? 2),
          objectiveIds: data.getAll('objectiveIds').map(String),
          rubric: [],
          ...(dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}),
        }),
        {
          loading: '正在创建学习活动',
          success: '学习活动已创建',
          error: '创建学习活动失败，请稍后重试',
        },
      )
      setActivityOpen(false)
      form.reset()
      await load()
    } catch {
      /* Toast owns the visible error state. */
    } finally {
      setBusy(false)
    }
  }

  const course: LearningCourse = {
    projectId: space.projectId,
    courseId: space.courseId,
    projectKind: space.projectKind,
    title: space.title,
    description: space.description,
    status: space.status,
    perspective: space.perspective,
    canManage: space.canManage,
    canEditContent: space.canEditContent,
  }
  const mutationError = (reason: unknown) => {
    setError(userFacingError(reason, '课程内容操作未完成，请稍后重试。'))
  }

  if (loading) return <ResourceSkeleton variant="list" count={5} label="正在加载课程内容" />

  return (
    <div className="space-y-6">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {!canEdit && <Alert><AlertDescription>当前课程状态下可以查看内容，但不能创建、发布或关闭内容。</AlertDescription></Alert>}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle>学习目标</CardTitle>
              <CardDescription>设置成功标准、掌握等级与前置关系。</CardDescription>
            </div>
            {canEdit && <Button type="button" size="sm" onClick={() => setObjectiveOpen(true)}>创建目标</Button>}
          </div>
        </CardHeader>
        <CardContent>
          <LearningObjectivesSection
            course={course}
            objectives={objectives}
            perspective="teacher"
            mastery={new Map()}
            onChanged={load}
            onError={mutationError}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle>学习活动</CardTitle>
              <CardDescription>设置活动类型、评价模式、关联目标与截止时间。</CardDescription>
            </div>
            {canEdit && <Button type="button" size="sm" onClick={() => setActivityOpen(true)}>创建活动</Button>}
          </div>
        </CardHeader>
        <CardContent>
          <LearningActivitiesSection
            course={course}
            activities={activities}
            perspective="teacher"
            answers={answers}
            setAnswers={setAnswers}
            onChanged={load}
            onError={mutationError}
          />
        </CardContent>
      </Card>

      <Dialog open={canEdit && objectiveOpen} onOpenChange={setObjectiveOpen}>
        <DialogContent className="@container/learning-grid max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>创建学习目标</DialogTitle>
            <DialogDescription>目标会先保存为草稿，确认后再单独发布。</DialogDescription>
          </DialogHeader>
          <form id="course-objective-form" onSubmit={createObjective} className="space-y-5">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="course-objective-title">目标标题</FieldLabel>
                <Input id="course-objective-title" name="title" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="course-objective-success">成功标准</FieldLabel>
                <Textarea id="course-objective-success" name="successCriteria" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="course-objective-level">目标掌握等级</FieldLabel>
                <Input id="course-objective-level" name="targetLevel" type="number" min="1" max="4" defaultValue="2" required />
              </Field>
              <Field>
                <FieldLabel>前置目标</FieldLabel>
                <ObjectiveCheckboxes objectives={objectives} name="prerequisiteIds" idPrefix="course-objective-prerequisite" emptyLabel="暂无可选的前置目标。" />
              </Field>
            </FieldGroup>
          </form>
          <DialogFooter className="sticky bottom-0 z-10 -mx-6 -mb-6 border-t bg-popover px-6 py-4">
            <Button type="button" variant="outline" onClick={() => setObjectiveOpen(false)}>取消</Button>
            <Button type="submit" form="course-objective-form" disabled={busy}>创建目标</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={canEdit && activityOpen} onOpenChange={setActivityOpen}>
        <DialogContent className="@container/learning-grid max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>创建学习活动</DialogTitle>
            <DialogDescription>活动会先保存为草稿，确认后再单独发布。</DialogDescription>
          </DialogHeader>
          <form id="course-activity-form" onSubmit={createActivity} className="space-y-5">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="course-activity-title">活动标题</FieldLabel>
                <Input id="course-activity-title" name="title" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="course-activity-instructions">活动说明</FieldLabel>
                <Textarea id="course-activity-instructions" name="instructions" required />
              </Field>
              <div className="grid gap-5 @min-[36rem]/learning-grid:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="course-activity-type">活动类型</FieldLabel>
                  <Select name="type" defaultValue="LESSON">
                    <SelectTrigger id="course-activity-type" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{ACTIVITY_TYPES.map((type) => <SelectItem key={type} value={type}>{ACTIVITY_TYPE_LABELS[type]}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="course-activity-evaluation">评价模式</FieldLabel>
                  <Select name="evaluationMode" defaultValue="TEACHER_REQUIRED">
                    <SelectTrigger id="course-activity-evaluation" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{EVALUATION_MODES.map((mode) => <SelectItem key={mode} value={mode}>{EVALUATION_MODE_LABELS[mode]}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="course-activity-level">目标掌握等级</FieldLabel>
                  <Input id="course-activity-level" name="targetLevel" type="number" min="1" max="4" defaultValue="2" required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="course-activity-due-at">截止时间</FieldLabel>
                  <Input id="course-activity-due-at" name="dueAt" type="datetime-local" />
                </Field>
              </div>
              <Field>
                <FieldLabel>关联目标</FieldLabel>
                <ObjectiveCheckboxes objectives={objectives} name="objectiveIds" idPrefix="course-activity-objective" emptyLabel="请先创建学习目标，或创建一个暂不关联目标的活动。" />
              </Field>
            </FieldGroup>
          </form>
          <DialogFooter className="sticky bottom-0 z-10 -mx-6 -mb-6 border-t bg-popover px-6 py-4">
            <Button type="button" variant="outline" onClick={() => setActivityOpen(false)}>取消</Button>
            <Button type="submit" form="course-activity-form" disabled={busy}>创建活动</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
