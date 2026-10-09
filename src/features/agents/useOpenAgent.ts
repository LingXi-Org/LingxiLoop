import { useEffect, useRef, useState } from 'react'
import { conversationsApi } from '@/features/conversations/api'
import { useConversations } from '@/features/conversations/store'
import { useWorkspace } from '@/features/knowledge/workspace'
import { getWorkspaceSession } from '@/lib/workspaceSession'
import { userFacingError } from '@/lib/userFacingError'
import { currentWebNavigation, isCurrentWebNavigation } from '@/lib/webNavigation'
import { useApp } from '@/stores/app'
import { useAuth } from '@/stores/auth'
import type { Participant } from '@/types'

export interface AgentActionProps {
  onOpenTeachingWorkspace?: (agent: Participant) => Promise<boolean>
  onChooseWorkspace?: () => void
}

/** The create response owns the channel ID; context-thread IDs are never UI selections. */
export function useOpenAgent(agent: Participant | undefined, actions: AgentActionProps, onOpened?: () => void) {
  const projectId = useWorkspace((state) => state.selectedId)
  const canCreate = useWorkspace((state) => state.list.find((item) => item.id === state.selectedId)?.status === 'ACTIVE')
  const hasConversation = useConversations((state) => state.projectId === projectId && state.list.some((item) => item.kind === 'direct' && item.members.includes(agent?.id ?? '')))
  const actionLabel = agent?.managed ? '打开教学工作台' : canCreate ? '开始对话' : hasConversation ? '查看已有对话' : '选择工作区'
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryingRefresh, setRetryingRefresh] = useState(false)
  const mounted = useRef(false)
  const submitting = useRef(false)
  const created = useRef<{ scope: string; id: string } | null>(null)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const chooseWorkspace = () => {
    onOpened?.()
    useApp.setState({ mobileConversationOpen: false })
    // Let the profile close and the mobile rail mount before focusing its picker.
    window.requestAnimationFrame(() => actions.onChooseWorkspace?.())
  }

  const open = async () => {
    if (!agent || agent.kind !== 'agent' || agent.departedAt || submitting.current) return
    const userId = useAuth.getState().user?.id
    const workspace = getWorkspaceSession()
    if (!userId || !workspace) { chooseWorkspace(); return }
    const navigationEpoch = currentWebNavigation()
    const scope = `${userId}:${workspace.companyId}:${workspace.projectId}:${agent.id}`
    const isCurrent = () => {
      const current = getWorkspaceSession()
      return mounted.current && current?.companyId === workspace.companyId && current.projectId === workspace.projectId
        && useAuth.getState().user?.id === userId && useAuth.getState().activeCompanyId === workspace.companyId
        && (agent.managed || isCurrentWebNavigation(navigationEpoch))
    }
    if (!isCurrent()) return
    submitting.current = true
    setOpening(true); setError(null)
    let conversationId = created.current?.scope === scope ? created.current.id : null
    try {
      if (agent.managed) {
        const opened = await actions.onOpenTeachingWorkspace?.(agent)
        if (opened) { if (mounted.current) onOpened?.() }
        else if (isCurrent()) {
          if (actions.onChooseWorkspace) chooseWorkspace()
          else setError('暂时无法打开教学工作台，请选择可用课程。')
        }
        return
      }
      const project = useWorkspace.getState().list.find((item) => item.id === workspace.projectId)
      if (!project || project.status !== 'ACTIVE') {
        const existing = useConversations.getState()
        conversationId = existing.projectId === workspace.projectId
          ? existing.list.find((item) => item.kind === 'direct' && item.members.includes(agent.id))?.id ?? null : null
        if (!conversationId) {
          if (actions.onChooseWorkspace) chooseWorkspace()
          else setError('当前课程暂不能开始新对话，请选择可用课程。')
          return
        }
      } else if (!conversationId) {
        const result = await conversationsApi.create(workspace.projectId, { participantIds: [agent.id] })
        if (!isCurrent()) return
        conversationId = result.id
        created.current = { scope, id: conversationId }
        setRetryingRefresh(true)
      }
      await useConversations.getState().reload()
      if (!isCurrent()) return
      const refreshed = useConversations.getState()
      if (refreshed.error || !refreshed.loaded || refreshed.loading || refreshed.projectId !== workspace.projectId || !refreshed.list.some((item) => item.id === conversationId)) {
        setError('对话已就绪，但列表刷新失败，请重试刷新。')
        return
      }
      setRetryingRefresh(false)
      useApp.getState().selectConversation(conversationId)
      onOpened?.()
    } catch (reason) {
      if (isCurrent()) setError(conversationId
        ? '对话已就绪，但列表刷新失败，请重试刷新。'
        : userFacingError(reason, '暂时无法打开，请稍后重试。'))
    } finally {
      submitting.current = false
      if (mounted.current) setOpening(false)
    }
  }

  return { opening, error, retryingRefresh, actionLabel, open, chooseWorkspace }
}
