import { useCallback, useEffect, useRef, useState } from 'react'
import { useWorkspace } from '@/features/knowledge/workspace'
import { learningApi } from '@/features/learning/api'
import type { LearningSpace } from '@/features/learning/contracts'
import { userFacingError } from '@/lib/userFacingError'
import { toastAction } from '@/lib/actionToast'
import { useAuth } from '@/stores/auth'
import { getLearningSpaceScopes, switchLearningWorkspace } from './dashboardScope'

export function useLearningSpaces() {
  const companyId = useAuth((state) => state.activeCompanyId)
  const projectId = useWorkspace((state) => state.selectedId)
  const [spaces, setSpaces] = useState<LearningSpace[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const requestEpoch = useRef(0)
  const selectionPending = useRef(false)
  const [pending, setPending] = useState(false)
  const reload = useCallback(async () => {
    const epoch = ++requestEpoch.current
    setLoading(true)
    setError('')
    try {
      const byProjectId = new Map<string, LearningSpace>()
      const cursors = new Set<string>()
      let cursor: string | undefined
      for (let index = 0; index < 50; index += 1) {
        const page = await learningApi.listSpaces({ cursor, limit: 100 })
        if (epoch !== requestEpoch.current) return
        for (const space of page.data) byProjectId.set(space.projectId, space)
        if (!page.nextCursor) { cursor = undefined; break }
        if (cursors.has(page.nextCursor)) throw new Error('repeated learning spaces cursor')
        cursors.add(page.nextCursor)
        cursor = page.nextCursor
      }
      if (cursor) throw new Error('learning spaces page limit exceeded')
      setSpaces(getLearningSpaceScopes([...byProjectId.values()]).visible.filter((space) => space.companyId === companyId))
    } catch (reason) {
      if (epoch === requestEpoch.current) setError(userFacingError(reason, '学习区暂时无法加载，请稍后重试。'))
    } finally {
      if (epoch === requestEpoch.current) setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    void reload()
    const refresh = () => void reload()
    window.addEventListener('lingxiloop:learning-spaces-updated', refresh)
    return () => {
      requestEpoch.current += 1
      window.removeEventListener('lingxiloop:learning-spaces-updated', refresh)
    }
  }, [reload])

  const select = async (space: LearningSpace) => {
    if (selectionPending.current || space.projectId === projectId) return
    selectionPending.current = true
    setPending(true)
    try {
      await toastAction(switchLearningWorkspace(space), {
        loading: '正在切换工作区', success: `已切换到${space.title}`,
        error: (reason) => userFacingError(reason, '切换工作区失败，请稍后重试。'),
      })
    } catch { /* Toast owns the visible error state. */ }
    finally { selectionPending.current = false; setPending(false) }
  }

  return { spaces, activeSpace: spaces.find((space) => space.companyId === companyId && space.projectId === projectId), loading, error, reload, pending, select }
}
