import { useCallback, useEffect, useRef, useState } from 'react'
import { userFacingError } from '@/lib/userFacingError'
import { learningApi } from '../api'
import type {
  LearningActivity,
  LearningEvidence,
  LearningMission,
  LearningObjective,
  LearningOverview,
  LearningReview,
  LearningRole,
} from '../contracts'

interface LearningDashboardResources {
  objectives: LearningObjective[]
  activities: LearningActivity[]
  evidence: LearningEvidence[]
  missions: LearningMission[]
  reviews: LearningReview[]
}

const EMPTY_RESOURCES: LearningDashboardResources = {
  objectives: [],
  activities: [],
  evidence: [],
  missions: [],
  reviews: [],
}

export function useLearningDashboardData(projectId: string, perspective: LearningRole, canReview: boolean) {
  const overviewRequestEpoch = useRef(0)
  const resourcesRequestEpoch = useRef(0)
  const [overview, setOverview] = useState<LearningOverview | null>(null)
  const [resources, setResources] = useState<LearningDashboardResources>(EMPTY_RESOURCES)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [resourcesLoading, setResourcesLoading] = useState(true)
  const [overviewError, setOverviewError] = useState('')
  const [resourcesError, setResourcesError] = useState('')

  const refreshOverview = useCallback(async () => {
    const requestEpoch = ++overviewRequestEpoch.current
    setOverviewLoading(true)
    setOverviewError('')
    try {
      const next = await learningApi.getOverview(projectId)
      if (requestEpoch !== overviewRequestEpoch.current) return
      setOverview(next)
    } catch (reason) {
      if (requestEpoch !== overviewRequestEpoch.current) return
      setOverviewError(userFacingError(reason, '学习概览暂时无法加载，请稍后重试。'))
    } finally {
      if (requestEpoch === overviewRequestEpoch.current) setOverviewLoading(false)
    }
  }, [projectId])

  const refreshResources = useCallback(async () => {
    const requestEpoch = ++resourcesRequestEpoch.current
    setResourcesLoading(true)
    setResourcesError('')
    try {
      const [objectives, activities, evidence, missions, reviews] = await Promise.all([
        learningApi.listKnowledgeUnits(projectId),
        learningApi.listActivities(projectId),
        learningApi.listEvidence(projectId),
        learningApi.listMissions(projectId),
        perspective === 'teacher' && canReview ? learningApi.listReviews(projectId) : Promise.resolve([]),
      ])
      if (requestEpoch !== resourcesRequestEpoch.current) return
      setResources({ objectives, activities, evidence, missions, reviews })
    } catch (reason) {
      if (requestEpoch !== resourcesRequestEpoch.current) return
      setResourcesError(userFacingError(reason, '学习内容暂时无法加载，请稍后重试。'))
    } finally {
      if (requestEpoch === resourcesRequestEpoch.current) setResourcesLoading(false)
    }
  }, [canReview, perspective, projectId])

  useEffect(() => {
    overviewRequestEpoch.current += 1
    resourcesRequestEpoch.current += 1
    setOverview(null)
    setResources(EMPTY_RESOURCES)
    void refreshOverview()
    void refreshResources()
    return () => {
      overviewRequestEpoch.current += 1
      resourcesRequestEpoch.current += 1
    }
  }, [refreshOverview, refreshResources])

  useEffect(() => {
    const refresh = () => {
      void refreshOverview()
      void refreshResources()
    }
    window.addEventListener('lingxiloop:learning-updated', refresh)
    return () => window.removeEventListener('lingxiloop:learning-updated', refresh)
  }, [refreshOverview, refreshResources])

  return {
    overview,
    resources,
    overviewLoading,
    resourcesLoading,
    overviewError,
    resourcesError,
    refreshOverview,
    refreshResources,
    refreshAll: async () => {
      await Promise.all([refreshOverview(), refreshResources()])
    },
  }
}
