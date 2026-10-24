import { Archive02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useRef, useState } from 'react'
import { CourseSettingsSkeleton } from './LearningSkeletons'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { projectLifecycleApi } from '@/features/projects/api'
import { toastAction } from '@/lib/actionToast'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import { userFacingError } from '@/lib/userFacingError'
import { useApp } from '@/stores/app'
import { learningApi } from '../api'
import { statusLabel } from '../components/learningDisplay'
import type { ApiCourse, LearningSpace } from '../contracts'
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
type CourseSettingsSectionProps = { space: LearningSpace; section: 'profile' | 'members' | 'status' }

export function CourseSettingsSection({ space, section }: CourseSettingsSectionProps) {
  const canView = space.perspective === 'teacher' && space.canManage && Boolean(space.courseId)
  if (!canView) {
    return <DashboardSectionFrame space={space} section="settings"><Alert><AlertDescription>你没有查看课程设置的权限。</AlertDescription></Alert></DashboardSectionFrame>
  }
  return <ScopedCourseSettingsSection key={JSON.stringify([space.companyId, space.projectId, space.courseId])} space={space} section={section} />
}

function ScopedCourseSettingsSection({ space, section }: CourseSettingsSectionProps) {
  const setView = useApp(state => state.setView)
  const [course, setCourse] = useState<ApiCourse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const current = useRef({ mounted: true, space, course })
  current.current.space = space
  current.current.course = course

  useEffect(() => {
    current.current.mounted = true
    return () => { current.current.mounted = false }
  }, [])

  useEffect(() => {
    if (!space.courseId) return
    let active = true
    setLoading(true)
    setError('')
    void learningApi
      .getCourse(space.courseId)
      .then((next) => {
        if (next.id !== space.courseId || next.companyId !== space.companyId || next.projectId !== space.projectId) {
          throw new Error('Course response scope mismatch')
        }
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
  }, [space.companyId, space.projectId, space.courseId, revision])
  if (loading && !course) return <DashboardSectionFrame space={space} section="settings"><CourseSettingsSkeleton section={section} /></DashboardSectionFrame>
  if (!course) {
    return <DashboardSectionFrame space={space} section="settings"><Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center gap-3">{error || '课程设置暂不可用。'}<Button variant="outline" size="sm" disabled={loading} onClick={() => setRevision(value => value + 1)}>重试</Button></AlertDescription></Alert></DashboardSectionFrame>
  }

  const canEdit = space.canUpdateCourse && course.canManage && course.status === space.status
  const lifecycleAction = course.canManage && course.status === space.status ? space.lifecycleAction : null
  const lifecycle = lifecycleAction ? LIFECYCLE_ACTIONS[lifecycleAction] : null
  const advanceLifecycle = async () => {
    if (busy || !space.canManage || !lifecycle) return
    const confirmed = await confirmSensitiveAction({
      title: `${lifecycle.label}？`,
      description: lifecycle.description,
      confirmLabel: lifecycle.label,
      tone: lifecycle.destructive ? 'destructive' : 'warning',
    })
    if (!confirmed || !current.current.mounted || !current.current.space.canManage
      || !current.current.course?.canManage || current.current.space.status !== current.current.course.status
      || current.current.space.lifecycleAction !== lifecycleAction || current.current.course?.status !== course.status) return
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
      section="settings"
    >
        {error && <Alert variant="destructive" className="mb-4"><AlertDescription className="flex flex-wrap items-center gap-3">{error}<Button size="sm" variant="outline" disabled={loading} onClick={() => setRevision(value => value + 1)}>重试</Button></AlertDescription></Alert>}
        <Tabs value={section} onValueChange={value => setView(value === 'members' ? 'course-members' : value === 'status' ? 'course-status' : 'courses')} className="gap-4" data-testid="course-settings-tabs">
          <TabsList aria-label="课程设置" className="max-w-full [&_[data-state=active]]:bg-background [&_[data-state=active]]:text-foreground">
            <TabsTrigger value="profile">基本资料</TabsTrigger>
            <TabsTrigger value="members">成员与邀请</TabsTrigger>
            <TabsTrigger value="status">课程状态</TabsTrigger>
          </TabsList>
          <TabsContent value="profile" className="min-w-0">
            <CourseProfileSettings course={course} canEdit={canEdit} onUpdated={setCourse} />
          </TabsContent>
          <TabsContent value="members" className="min-w-0">
            <CourseMembersSection space={space} />
          </TabsContent>
          <TabsContent value="status" className="min-w-0">
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
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DashboardSectionFrame>

  )
}
