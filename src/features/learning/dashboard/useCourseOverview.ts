import { useEffect, useState } from 'react'
import { learningApi } from '../api'
import type { ApiCourse, ApiCourseMember, LearningSpace } from '../contracts'
import { forumApi } from '../forum/api'
import type { ForumItem, ForumPage, SubmissionVersion } from '../forum/contracts'
import { homeworkApi } from '../homework/api'
import type { HomeworkDetail, HomeworkLearner } from '../homework/contracts'
import { userFacingError } from '@/lib/userFacingError'

interface CourseOverview {
  course: ApiCourse
  items: ForumItem[]
  members: ApiCourseMember[]
  submissions: Array<{ item: ForumItem; submission: SubmissionVersion }>
  homeworks: Array<{ item: ForumItem; detail: HomeworkDetail; learners: HomeworkLearner[] }>
}
async function allPages<T>(load: (offset: number) => Promise<ForumPage<T>>) {
  const items: T[] = []
  let offset: number | null = 0
  while (offset !== null) {
    const page = await load(offset)
    items.push(...page.items)
    offset = page.nextOffset
  }
  return items
}
export function useCourseOverview(space: LearningSpace) {
  const [data, setData] = useState<CourseOverview | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    setData(null)
    setLoading(true)
    setError('')
    const load = async () => {
      if (!space.courseId) return null
      const courseId = space.courseId
      const [course, items, members] = await Promise.all([
        learningApi.getCourse(courseId),
        allPages(offset => forumApi.list(courseId, { kind: 'all', search: '', tag: '', offset })),
        space.perspective === 'teacher' && space.canManage ? learningApi.listCourseMembers(courseId) : Promise.resolve([]),
      ])
      const homeworks: CourseOverview['homeworks'] = []
      const assignments = items.filter(item => item.targetType === 'homework')
      // Bound concurrent requests while retaining every page in the overview totals.
      for (let index = 0; index < assignments.length && active; index += 4) {
        homeworks.push(...await Promise.all(assignments.slice(index, index + 4).map(async item => ({
          item,
          detail: await homeworkApi.detail(courseId, item.id),
          learners: space.perspective === 'teacher' && space.canReview
            ? await allPages(offset => homeworkApi.learners(courseId, item.id, offset)) : [],
        }))))
      }
      const submissions: CourseOverview['submissions'] = []
      const posts = items.filter(item => item.targetType === 'post' && item.kind === 'assignment')
      for (let index = 0; index < posts.length && active; index += 4) {
        const batches = await Promise.all(posts.slice(index, index + 4).map(async item => {
          const versions = await allPages(offset => forumApi.submissions(courseId, item.id, offset))
          const latest = new Map<string, SubmissionVersion>()
          for (const submission of versions) {
            if ((latest.get(submission.learnerId)?.version ?? 0) < submission.version) latest.set(submission.learnerId, submission)
          }
          return [...latest.values()].map(submission => ({ item, submission }))
        }))
        submissions.push(...batches.flat())
      }
      return { course, items, members, homeworks, submissions }
    }
    void load().then(value => { if (active) setData(value) }).catch(reason => {
      if (active) setError(userFacingError(reason, '课程概览暂时无法加载，请重试。'))
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [space.courseId, space.perspective, space.canManage, space.canReview, revision])
  return { data, error, loading, refresh: () => setRevision(value => value + 1) }
}
