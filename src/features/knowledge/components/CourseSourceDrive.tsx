import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SourceFoldersSkeleton } from './SourceSkeletons'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { learningApi } from '@/features/learning/api'
import type { ApiCourseMember, LearningSpace } from '@/features/learning/contracts'
import { DashboardSectionFrame } from '@/features/learning/dashboard/DashboardSectionFrame'
import { userFacingError } from '@/lib/userFacingError'
import { knowledgeApi } from '../api'
import type { KnowledgeSource } from '../contracts'
import { ProjectSourceLibrary } from './ProjectSourceLibrary'

interface CourseFolder {
  id: string
  name: string
  visibilityScope: KnowledgeSource['visibilityScope']
  ownerUserId?: string
  readOnly: boolean
}

export function CourseSourceDrive({ space }: { space: LearningSpace }) {
  const [sources, setSources] = useState<KnowledgeSource[]>([])
  const [members, setMembers] = useState<ApiCourseMember[]>([])
  const [scopeId, setScopeId] = useState('public')
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const requests = useRef(0)
  const reviewMode = space.perspective === 'teacher'

  const load = useCallback(async () => {
    const epoch = ++requests.current
    setLoading(true)
    setError('')
    try {
      if (reviewMode) {
        if (!space.courseId) throw new Error('课程资料缺少课程标识')
        const [nextSources, nextMembers] = await Promise.all([
          knowledgeApi.listCourseReviewSources(space.projectId),
          learningApi.listCourseMembers(space.courseId),
        ])
        if (epoch !== requests.current) return
        setSources(nextSources)
        setMembers(nextMembers)
      } else {
        const nextSources = await knowledgeApi.listProjectSources(space.projectId)
        if (epoch !== requests.current) return
        setSources(nextSources)
        setMembers([])
      }
      setLoaded(true)
    } catch (reason) {
      if (epoch === requests.current) setError(userFacingError(reason, '课程资料暂时无法加载，请稍后重试。'))
    } finally {
      if (epoch === requests.current) setLoading(false)
    }
  }, [reviewMode, space.courseId, space.projectId])

  useEffect(() => {
    setScopeId('public')
    setSources([])
    setMembers([])
    setLoaded(false)
    void load()
    return () => { requests.current++ }
  }, [load])

  const folders = useMemo<CourseFolder[]>(() => {
    if (!reviewMode) {
      return [
        { id: 'public', name: '公共资料', visibilityScope: 'PROJECT', readOnly: true },
        { id: 'personal', name: '个人资料', visibilityScope: 'PRIVATE', readOnly: !space.canSubmit },
      ]
    }

    const learnerFolders = new Map<string, CourseFolder>()
    for (const source of sources) {
      if (source.visibilityScope !== 'PRIVATE') continue
      learnerFolders.set(source.ownerUserId, {
        id: `learner:${source.ownerUserId}`,
        name: `${source.ownerName || '学员'}个人资料`,
        visibilityScope: 'PRIVATE',
        ownerUserId: source.ownerUserId,
        readOnly: true,
      })
    }
    for (const member of members) {
      if (member.role !== 'learner') continue
      learnerFolders.set(member.id, {
        id: `learner:${member.id}`,
        name: `${member.name}个人资料`,
        visibilityScope: 'PRIVATE',
        ownerUserId: member.id,
        readOnly: true,
      })
    }
    return [
      { id: 'public', name: '公共资料', visibilityScope: 'PROJECT', readOnly: !space.canEditContent },
      ...[...learnerFolders.values()].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')),
    ]
  }, [members, reviewMode, sources, space.canEditContent, space.canSubmit])

  const selectedScope = folders.find((folder) => folder.id === scopeId) ?? folders[0]

  return <DashboardSectionFrame space={space} section="resources">
    {loading && !loaded ? <SourceFoldersSkeleton /> : error && !loaded ? (
      <Alert variant="destructive"><AlertDescription className="flex items-center justify-between gap-3">{error}<Button type="button" variant="outline" size="sm" onClick={() => void load()}>重新加载</Button></AlertDescription></Alert>
    ) : <div aria-busy={loading} className="space-y-5">
      {error && <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center gap-3">{error}<Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>重试</Button></AlertDescription></Alert>}
      <div className="flex flex-wrap items-center gap-3">
        <Label htmlFor="course-source-scope">资料范围</Label>
        <Select value={selectedScope.id} onValueChange={setScopeId}>
          <SelectTrigger id="course-source-scope" className="min-h-11 max-w-full sm:min-h-9 sm:w-64"><SelectValue /></SelectTrigger>
          <SelectContent>{folders.map((folder) => <SelectItem key={folder.id} value={folder.id}>{folder.name}</SelectItem>)}</SelectContent>
        </Select>
        {selectedScope.readOnly && <Badge variant="outline">只读</Badge>}
      </div>
      <ProjectSourceLibrary
        key={`${space.projectId}:${selectedScope.id}:${reviewMode}`}
        projectId={space.projectId}
        canManage={space.canManage}
        visibilityScope={selectedScope.visibilityScope}
        ownerUserId={selectedScope.ownerUserId}
        readOnly={selectedScope.readOnly}
        reviewMode={reviewMode}
      />
    </div>}
  </DashboardSectionFrame>
}
