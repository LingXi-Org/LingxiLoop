import { useCallback, useEffect, useRef, useState } from 'react'
import { userFacingError } from '@/lib/userFacingError'
import { learningApi } from '../api'
import type {
  LearningActivity,
  LearningObjective,
  LearningReview,
  TeacherLearningOverview,
} from '../contracts'

export interface TeacherOverviewData {
  overview: TeacherLearningOverview
  objectives: LearningObjective[]
  activities: LearningActivity[]
  reviews: LearningReview[]
}

export function useTeacherOverviewData(projectId: string, canReview: boolean) {
  const requestEpoch = useRef(0)
  const loaded = useRef(false)
  const [data, setData] = useState<TeacherOverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  const refresh = useCallback(async () => {
    const epoch = ++requestEpoch.current
    if (!loaded.current) setLoading(true)
    setError('')
    try {
      const [overview, objectives, activities, reviews] = await Promise.all([
        learningApi.getOverview(projectId),
        learningApi.listKnowledgeUnits(projectId),
        learningApi.listActivities(projectId),
        canReview ? learningApi.listReviews(projectId) : Promise.resolve<LearningReview[]>([]),
      ])
      if (epoch !== requestEpoch.current) return
      if (overview.perspective !== 'teacher') throw new Error('teacher overview returned learner data')
      loaded.current = true
      setData({ overview, objectives, activities, reviews })
      setRevision((current) => current + 1)
    } catch (reason) {
      if (epoch === requestEpoch.current) {
        setError(userFacingError(reason, '课程总览暂时无法加载，请稍后重试。'))
      }
    } finally {
      if (epoch === requestEpoch.current) setLoading(false)
    }
  }, [canReview, projectId])

  useEffect(() => {
    loaded.current = false
    setData(null)
    void refresh()
    return () => { requestEpoch.current += 1 }
  }, [refresh])

  return { data, loading, error, refresh, revision }
}
