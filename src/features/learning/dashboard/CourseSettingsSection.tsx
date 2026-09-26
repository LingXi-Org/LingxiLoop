import { Archive02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useState } from 'react'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { projectLifecycleApi } from '@/features/projects/api'
import { toastAction } from '@/lib/actionToast'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import { userFacingError } from '@/lib/userFacingError'
import { learningApi } from '../api'
import { statusLabel } from '../components/learningDisplay'
import type { ApiCourse, LearningSpace } from '../contracts'
import { CourseContentSettings } from './CourseContentSettings'
import { CourseMembersSection } from './CourseMembersSection'
import { CourseProfileSettings } from './CourseProfileSettings'
import { DashboardSectionFrame } from './DashboardSectionFrame'

const LIFECYCLE_ACTIONS = {
  END: {
    label: '结束课程',
    description: '课程将停止新邀请和新学习活动。',
    run: projectLifecycleApi.end,
    destructive: false,
  },
  ENTER_READ_ONLY: {
    label: '设为仅查看',
    description: '课程成员仍可查看内容，但不能继续修改。',
    run: projectLifecycleApi.enterReadOnly,
    destructive: false,
  },
  ENTER_RETENTION: {
    label: '进入保留期',
    description: '课程进入保留期后，仅保留必要的历史访问。',
    run: projectLifecycleApi.enterRetention,
    destructive: false,
  },
  ARCHIVE: {
    label: '归档课程',
    description: '课程将归档，历史内容继续保留。',
    run: projectLifecycleApi.archive,
    destructive: true,
  },
} satisfies Record<
  NonNullable<LearningSpace['lifecycleAction']>,
  {
    label: string
    description: string
    run(projectId: string): Promise<{ ok: true; status: ApiCourse['status']; applied: boolean }>
    destructive: boolean
  }
>
const SETTINGS_TABS = [
  { value: 'profile', label: '基本资料', description: '这些信息会显示给所有课程成员。' },
  { value: 'content', label: '课程内容', description: '管理学习目标、成功标准与课程活动。' },
  { value: 'members', label: '成员与邀请', description: '管理课程成员与邀请。' },
  { value: 'status', label: '课程状态', description: '完成状态变更后，课程权限会随之更新。' },
] as const
export function CourseSettingsSection({ space, section }: { space: LearningSpace; section: 'profile' | 'content' | 'members' | 'status' }) {
  const current = SETTINGS_TABS.find((tab) => tab.value === section) ?? SETTINGS_TABS[0]
  const canView = space.perspective === 'teacher' && space.canManage && Boolean(space.courseId)
  const canEdit = canView && space.canUpdateCourse
  const frameSection = section === 'profile' ? 'settings' : section
  const [course, setCourse] = useState<ApiCourse | null>(null)
  const [loading, setLoading] = useState(canView)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!canView || !space.courseId) return
    let active = true
    setLoading(true)
    setError('')
    void learningApi
      .getCourse(space.courseId)
      .then((next) => {
        if (active) setCourse(next)
      })
      .catch((reason) => {
        if (active) setError(userFacingError(reason, '课程设置暂时无法加载，请稍后重试。'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [canView, space.courseId])
  if (!canView) {
    return <DashboardSectionFrame space={space} section={frameSection}><Alert><AlertDescription>你没有查看课程设置的权限。</AlertDescription></Alert></DashboardSectionFrame>
  }
  if (loading) return <DashboardSectionFrame space={space} section={frameSection}><ResourceSkeleton variant="detail" label="正在加载课程设置" /></DashboardSectionFrame>
  if (error || !course) {
    return <DashboardSectionFrame space={space} section={frameSection}><Alert variant="destructive"><AlertDescription>{error || '课程设置暂不可用。'}</AlertDescription></Alert></DashboardSectionFrame>
  }

  const lifecycleAction = course.status === space.status ? space.lifecycleAction : null
  const lifecycle = lifecycleAction ? LIFECYCLE_ACTIONS[lifecycleAction] : null
  const advanceLifecycle = async () => {
    if (busy || !space.canManage || !lifecycle) return
    const confirmed = await confirmSensitiveAction({
      title: `${lifecycle.label}？`,
      description: lifecycle.description,
      confirmLabel: lifecycle.label,
      tone: lifecycle.destructive ? 'destructive' : 'warning',
    })
    if (!confirmed) return
    setBusy(true)
    try {
      const result = await toastAction(lifecycle.run(space.projectId), {
        loading: `正在${lifecycle.label}`,
        success: `${lifecycle.label}成功`,
        error: `${lifecycle.label}失败，请稍后重试`,
      })
      setCourse({ ...course, status: result.status })
      window.dispatchEvent(new Event('lingxiloop:learning-spaces-updated'))
    } catch {
      /* Toast owns the visible error state. */
    } finally {
      setBusy(false)
    }
  }

  return (
    <DashboardSectionFrame
      space={space}
      section={frameSection}
      description={current.description}
    >
        {section === 'profile' && <div className="min-w-0">
          <CourseProfileSettings course={course} canEdit={canEdit} onUpdated={setCourse} />
        </div>}
        {section === 'content' && <div className="min-w-0">
          <CourseContentSettings space={space} />
        </div>}
        {section === 'members' && <div className="min-w-0">
          <CourseMembersSection space={space} />
        </div>}
        {section === 'status' && <div className="min-w-0">
          <Card>
            <CardContent className="space-y-4">
              <Badge variant="secondary">{statusLabel(course.status)}</Badge>
              {lifecycle ? (
                <div>
                  <p className="mb-3 text-sm text-muted-foreground">{lifecycle.description}</p>
                  <Button
                    type="button"
                    variant={lifecycle.destructive ? 'destructive' : 'outline'}
                    disabled={busy}
                    onClick={() => void advanceLifecycle()}
                  >
                    <HugeiconsIcon icon={Archive02Icon} strokeWidth={2} data-icon="inline-start" />
                    {lifecycle.label}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">当前状态没有可执行的下一步。</p>
              )}
            </CardContent>
          </Card>
        </div>}
      </DashboardSectionFrame>

  )
}
