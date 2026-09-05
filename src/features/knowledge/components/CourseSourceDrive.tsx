import { Folder01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
  count: number
  readOnly: boolean
}

export function CourseSourceDrive({ space }: { space: LearningSpace }) {
  const [sources, setSources] = useState<KnowledgeSource[]>([])
  const [members, setMembers] = useState<ApiCourseMember[]>([])
  const [openFolderId, setOpenFolderId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const reviewMode = space.perspective === 'teacher'

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      if (reviewMode) {
        if (!space.courseId) throw new Error('课程资料缺少课程标识')
        const [nextSources, nextMembers] = await Promise.all([
          knowledgeApi.listCourseReviewSources(space.projectId),
          learningApi.listCourseMembers(space.courseId),
        ])
        setSources(nextSources)
        setMembers(nextMembers)
      } else {
        setSources(await knowledgeApi.listProjectSources(space.projectId))
        setMembers([])
      }
    } catch (reason) {
      setError(userFacingError(reason, '班级资料暂时无法加载，请稍后重试。'))
    } finally {
      setLoading(false)
    }
  }, [reviewMode, space.courseId, space.projectId])

  useEffect(() => {
    setOpenFolderId(null)
    void load()
  }, [load])

  const folders = useMemo<CourseFolder[]>(() => {
    const publicSources = sources.filter((source) => source.visibilityScope === 'PROJECT')
    if (!reviewMode) {
      return [
        { id: 'announcements', name: '公告资料', visibilityScope: 'PROJECT', count: publicSources.length, readOnly: true },
        { id: 'personal', name: '个人资料', visibilityScope: 'PRIVATE', count: sources.length - publicSources.length, readOnly: !space.canSubmit },
      ]
    }

    const learnerFolders = new Map<string, CourseFolder>()
    for (const source of sources) {
      if (source.visibilityScope !== 'PRIVATE') continue
      const current = learnerFolders.get(source.ownerUserId)
      learnerFolders.set(source.ownerUserId, {
        id: `learner:${source.ownerUserId}`,
        name: `${source.ownerName || '学员'}个人资料`,
        visibilityScope: 'PRIVATE',
        ownerUserId: source.ownerUserId,
        count: (current?.count ?? 0) + 1,
        readOnly: true,
      })
    }
    for (const member of members) {
      if (member.role !== 'learner') continue
      const current = learnerFolders.get(member.id)
      learnerFolders.set(member.id, {
        id: `learner:${member.id}`,
        name: `${member.name}个人资料`,
        visibilityScope: 'PRIVATE',
        ownerUserId: member.id,
        count: current?.count ?? 0,
        readOnly: true,
      })
    }
    return [
      { id: 'public', name: '公共资料', visibilityScope: 'PROJECT', count: publicSources.length, readOnly: !space.canEditContent },
      ...[...learnerFolders.values()].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')),
    ]
  }, [members, reviewMode, sources, space.canEditContent, space.canSubmit])

  const openFolder = folders.find((folder) => folder.id === openFolderId) ?? null
  const closeFolder = () => { setOpenFolderId(null); void load() }

  return <DashboardSectionFrame
    space={space}
    section="resources"
    breadcrumb={openFolder ? { root: '班级资料', current: openFolder.name, onBack: closeFolder } : undefined}
  >
    {openFolder ? <ProjectSourceLibrary
      projectId={space.projectId}
      canManage={space.canManage}
      visibilityScope={openFolder.visibilityScope}
      ownerUserId={openFolder.ownerUserId}
      readOnly={openFolder.readOnly}
      reviewMode={reviewMode}
    /> : loading ? <ResourceSkeleton variant="cards" count={4} label="正在加载班级资料" /> : error ? (
      <Alert variant="destructive"><AlertDescription className="flex items-center justify-between gap-3">{error}<Button type="button" variant="outline" size="sm" onClick={() => void load()}>重新加载</Button></AlertDescription></Alert>
    ) : <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {folders.map((folder) => <Card key={folder.id} size="sm" className="min-h-56 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-lg focus-within:ring-2 focus-within:ring-ring">
        <button type="button" className="flex h-full w-full flex-col items-start gap-4 px-5 py-5 text-start outline-none" onClick={() => setOpenFolderId(folder.id)}>
          <span className="grid size-20 place-items-center rounded-4xl bg-primary/10 text-primary">
            <HugeiconsIcon icon={Folder01Icon} strokeWidth={1.5} className="size-12" />
          </span>
          <span className="block min-w-0 truncate font-heading text-lg font-medium">{folder.name}</span>
          <span className="mt-auto flex w-full items-center gap-2 text-xs text-muted-foreground">
            {folder.readOnly ? <Badge variant="outline">只读</Badge> : <Badge variant="secondary">可管理</Badge>}
            <span className="ms-auto">{folder.count} 项资料</span>
          </span>
        </button>
      </Card>)}
    </div>}
  </DashboardSectionFrame>
}
