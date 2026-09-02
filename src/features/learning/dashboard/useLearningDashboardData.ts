import { useCallback, useEffect, useRef, useState } from 'react'
import { userFacingError } from '@/lib/userFacingError'
import { learningApi } from '../api'
import type {
  LearningActivity,
  LearningDashboard,
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
  states: LearningDashboard['states']
}

const EMPTY_RESOURCES: LearningDashboardResources = {
  objectives: [],
  activities: [],
  evidence: [],
  missions: [],
  reviews: [],
  states: [],
}

export function useLearningDashboardData(
  projectId: string,
  perspective: LearningRole,
  canReview: boolean,
) {
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
    if (perspective === 'learner') {
      const [objectives, activities, evidence, missions, dashboard] = await Promise.allSettled([
        learningApi.listKnowledgeUnits(projectId),
        learningApi.listActivities(projectId),
        learningApi.listEvidence(projectId),
        learningApi.listMissions(projectId),
        learningApi.getDashboard(),
      ])
      if (requestEpoch !== resourcesRequestEpoch.current) return
      setResources((current) => ({
        objectives: objectives.status === 'fulfilled' ? objectives.value : current.objectives,
        activities: activities.status === 'fulfilled' ? activities.value : current.activities,
        evidence: evidence.status === 'fulfilled' ? evidence.value : current.evidence,
        missions: missions.status === 'fulfilled' ? missions.value : current.missions,
        reviews: [],
        states:
          dashboard.status === 'fulfilled'
            ? dashboard.value.states.filter((state) => state.projectId === projectId)
            : current.states,
      }))
      const failures = [
        objectives.status === 'rejected' ? `学习目标：${userFacingError(objectives.reason)}` : '',
        activities.status === 'rejected' ? `课程活动：${userFacingError(activities.reason)}` : '',
        evidence.status === 'rejected' ? `学习证据：${userFacingError(evidence.reason)}` : '',
        missions.status === 'rejected' ? `学习任务：${userFacingError(missions.reason)}` : '',
        dashboard.status === 'rejected' ? `掌握状态：${userFacingError(dashboard.reason)}` : '',
      ].filter(Boolean)
      setResourcesError(failures.join('；'))
      setResourcesLoading(false)
      return
    }
    try {
      const [objectives, activities, evidence, missions, reviews] = await Promise.all([
        learningApi.listKnowledgeUnits(projectId),
        learningApi.listActivities(projectId),
        perspective === 'teacher' ? Promise.resolve([]) : learningApi.listEvidence(projectId),
        perspective === 'teacher' ? Promise.resolve([]) : learningApi.listMissions(projectId),
        perspective === 'teacher' && canReview ? learningApi.listReviews(projectId) : Promise.resolve([]),
      ])
      if (requestEpoch !== resourcesRequestEpoch.current) return
      setResources({ objectives, activities, evidence, missions, reviews, states: [] })
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
