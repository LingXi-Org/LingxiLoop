import { useCallback, useEffect, useState } from 'react'
import { learningApi } from '../api'
import type {
  LearningActivity,
  LearningDashboard,
  LearningDelivery,
  LearningEvidence,
  LearningMission,
  LearningNotificationPreferences,
  LearningObjective,
  LearningProgress,
  LearningReview,
  TeacherAgentSummary,
} from '../contracts'

const defaultPreferences: LearningNotificationPreferences = {
  project_id: null,
  in_app_enabled: true,
  email_enabled: false,
  push_enabled: false,
  timezone: 'Asia/Shanghai',
  daily_time: '19:00',
  weekly_day: 1,
  quiet_start: null,
  quiet_end: null,
}

export function useLearningCenter() {
  const [dashboard, setDashboard] = useState<LearningDashboard | null>(null)
  const [projectId, setProjectId] = useState('')
  const [objectives, setObjectives] = useState<LearningObjective[]>([])
  const [activities, setActivities] = useState<LearningActivity[]>([])
  const [evidence, setEvidence] = useState<LearningEvidence[]>([])
  const [missions, setMissions] = useState<LearningMission[]>([])
  const [reviews, setReviews] = useState<LearningReview[]>([])
  const [progress, setProgress] = useState<LearningProgress[]>([])
  const [teacherAgent, setTeacherAgent] = useState<TeacherAgentSummary | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [notificationPrefs, setNotificationPrefs] = useState(defaultPreferences)
  const [deliveries, setDeliveries] = useState<LearningDelivery[]>([])
  const [error, setError] = useState('')

  const loadDashboard = useCallback(async () => {
    const next = await learningApi.getDashboard()
    setDashboard(next)
    setProjectId((current) => current || next.projects[0]?.projectId || '')
  }, [])

  const loadProject = useCallback(async (id: string) => {
    if (!id) return
    const current = dashboard?.projects.find((project) => project.projectId === id)
    const [nextObjectives, nextActivities, nextEvidence, nextMissions, prefs, nextDeliveries] =
      await Promise.all([
        learningApi.listKnowledgeUnits(id), learningApi.listActivities(id),
        learningApi.listEvidence(id), learningApi.listMissions(id),
        learningApi.getNotificationPreferences(id), learningApi.listDeliveries(),
      ])
    setObjectives(nextObjectives)
    setActivities(nextActivities)
    setEvidence(nextEvidence)
    setMissions(nextMissions)
    setNotificationPrefs(prefs)
    setDeliveries(nextDeliveries)
    if (current?.perspective === 'teacher' && current.courseId) {
      const [nextReviews, nextProgress, nextTeacherAgent] = await Promise.all([
        learningApi.listReviews(id), learningApi.getProjectProgress(id), learningApi.getTeacherAgent(current.courseId),
      ])
      setReviews(nextReviews)
      setProgress(nextProgress)
      setTeacherAgent(nextTeacherAgent)
    } else {
      setReviews([])
      setProgress([])
      setTeacherAgent(null)
    }
  }, [dashboard?.projects])

  useEffect(() => {
    void loadDashboard().catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
  }, [loadDashboard])

  useEffect(() => {
    const refresh = () => void loadDashboard().then(() => loadProject(projectId)).catch((reason) => setError(String(reason)))
    window.addEventListener('lingxiloop:learning-updated', refresh)
    return () => window.removeEventListener('lingxiloop:learning-updated', refresh)
  }, [projectId, loadDashboard, loadProject])

  useEffect(() => {
    void loadProject(projectId).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
  }, [projectId, loadProject])

  return {
    dashboard, projectId, setProjectId, objectives, activities, evidence, missions, reviews, progress,
    teacherAgent, answers, setAnswers, notificationPrefs, setNotificationPrefs, deliveries,
    error, setError, loadDashboard, refreshProject: () => loadProject(projectId),
  }
}
