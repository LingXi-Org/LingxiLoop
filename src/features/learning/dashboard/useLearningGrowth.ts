import { useCallback, useEffect, useRef, useState } from 'react'
import { userFacingError } from '@/lib/userFacingError'
import { learningApi } from '../api'
import type { LearningGrowthLearner } from '../contracts'

export function useLearningGrowth(projectId: string) {
  const [learners, setLearners] = useState<LearningGrowthLearner[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)
  const updatedAt = useRef(0)

  const refresh = useCallback(async () => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError('')
    try {
      const members = new Map<string, LearningGrowthLearner>()
      const cursors = new Set<string>()
      let cursor: string | undefined
      do {
        const page = await learningApi.getGrowth(projectId, { cursor, signal: controller.signal })
        if (controller.signal.aborted) return
        for (const learner of page.data) members.set(learner.learnerId, learner)
        cursor = page.nextCursor ?? undefined
        if (cursor && cursors.has(cursor)) throw new Error('成长足迹分页未能继续，请重试。')
        if (cursor) cursors.add(cursor)
      } while (cursor)
      setLearners([...members.values()])
      updatedAt.current = Date.now()
    } catch (reason) {
      if (!controller.signal.aborted) setError(userFacingError(reason, '成长足迹暂时无法加载。'))
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
        request.current = null
      }
    }
  }, [projectId])

  useEffect(() => {
    setLearners([])
    void refresh()
    const onReturn = () => {
      if (!document.hidden && !request.current && Date.now() - updatedAt.current > 60_000) void refresh()
    }
    const onChanged = () => { void refresh() }
    window.addEventListener('focus', onReturn)
    document.addEventListener('visibilitychange', onReturn)
    window.addEventListener('lingxiloop:learning-updated', onChanged)
    window.addEventListener('lingxiloop:growth-updated', onChanged)
    window.addEventListener('lingxiloop:learning-spaces-updated', onChanged)
    return () => {
      request.current?.abort()
      window.removeEventListener('focus', onReturn)
      document.removeEventListener('visibilitychange', onReturn)
      window.removeEventListener('lingxiloop:learning-updated', onChanged)
      window.removeEventListener('lingxiloop:growth-updated', onChanged)
      window.removeEventListener('lingxiloop:learning-spaces-updated', onChanged)
    }
  }, [refresh])

  return { learners, loading, error, refresh }
}
