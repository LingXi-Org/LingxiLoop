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
  course_id: null,
  in_app_enabled: true,
  email_enabled: false,
  timezone: 'Asia/Shanghai',
  preferred_time: '19:00',
  quiet_start: null,
  quiet_end: null,
}

export function useLearningCenter() {
  const [dashboard, setDashboard] = useState<LearningDashboard | null>(null)
  const [courseId, setCourseId] = useState('')
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
    setCourseId((current) => current || next.courses[0]?.id || '')
  }, [])

  const loadCourse = useCallback(async (id: string) => {
    if (!id) return
    const [nextObjectives, nextActivities, nextEvidence, nextMissions, prefs, nextDeliveries] =
      await Promise.all([
        learningApi.listObjectives(id), learningApi.listActivities(id),
        learningApi.listEvidence(id), learningApi.listMissions(id),
        learningApi.getNotificationPreferences(id), learningApi.listDeliveries(),
      ])
    setObjectives(nextObjectives)
    setActivities(nextActivities)
    setEvidence(nextEvidence)
    setMissions(nextMissions)
    setNotificationPrefs(prefs)
    setDeliveries(nextDeliveries)
    const current = dashboard?.courses.find((course) => course.id === id)
    if (current?.courseRole === 'teacher') {
      const [nextReviews, nextProgress, nextTeacherAgent] = await Promise.all([
        learningApi.listReviews(id), learningApi.getCourseProgress(id), learningApi.getTeacherAgent(id),
      ])
      setReviews(nextReviews)
      setProgress(nextProgress)
      setTeacherAgent(nextTeacherAgent)
    } else {
      setReviews([])
      setProgress([])
      setTeacherAgent(null)
    }
  }, [dashboard?.courses])

  useEffect(() => {
    void loadDashboard().catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
  }, [loadDashboard])

  useEffect(() => {
    const refresh = () => void loadDashboard().then(() => loadCourse(courseId)).catch((reason) => setError(String(reason)))
    window.addEventListener('lingxiloop:learning-updated', refresh)
    return () => window.removeEventListener('lingxiloop:learning-updated', refresh)
  }, [courseId, loadCourse, loadDashboard])

  useEffect(() => {
    void loadCourse(courseId).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
  }, [courseId, loadCourse])

  return {
    dashboard, courseId, setCourseId, objectives, activities, evidence, missions, reviews, progress,
    teacherAgent, answers, setAnswers, notificationPrefs, setNotificationPrefs, deliveries,
    error, setError, loadDashboard, refreshCourse: () => loadCourse(courseId),
  }
}
