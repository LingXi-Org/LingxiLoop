import { chatLatency } from '@/features/chat/runtime/latency'
import { useConversations } from '@/features/conversations/store'
import { useWorkspace } from '@/features/knowledge/workspace'
import { viewForWorkspace } from '@/features/learning/dashboard/navigation'
import { useApp } from '@/stores/app'
import { useAuth } from '@/stores/auth'
import { useSurface } from '@/stores/surface'
import { userFacingError } from './userFacingError'
import { beginWebNavigation, isCurrentWebNavigation, readWebDestination, writeWebDestination } from './webNavigation'

/** Restore only after authentication. Project membership precedes every IM request. */
export async function retryWebNavigation(): Promise<void> {
  const destination = readWebDestination()
  const epoch = beginWebNavigation()
  const { activeCompanyId: companyId, user } = useAuth.getState()
  if (!companyId || !user) return
  const current = () => isCurrentWebNavigation(epoch) && useAuth.getState().activeCompanyId === companyId && useAuth.getState().user?.id === user.id
  useApp.setState({ navigationPending: true, navigationError: null, autoSelectConversation: false, selectedConversationId: null, mobileConversationOpen: false })
  useSurface.getState().closeSurface()
  try {
    let workspace = useWorkspace.getState()
    if (!workspace.loaded || workspace.companyId !== companyId || workspace.error || (destination.projectId && !workspace.list.some((item) => item.id === destination.projectId))) {
      await workspace.load(destination.projectId ?? undefined)
    }
    if (!current()) return
    workspace = useWorkspace.getState()
    if (workspace.error || !workspace.loaded || workspace.companyId !== companyId) throw new Error(workspace.error ?? '暂时无法打开工作区，请稍后重试。')
    const projectId = destination.projectId ?? workspace.selectedId
    const project = workspace.list.find((item) => item.id === projectId && item.status !== 'DELETED')
    if (!project) {
      workspace.leave()
      const error = destination.projectId ? '该工作区不存在或无权访问，请重新选择。' : null
      useApp.setState({ view: 'conversations', navigationReady: true, navigationPending: false, navigationError: error })
      writeWebDestination({ projectId: null, view: 'conversations', conversationId: null }, 'replace')
      return
    }
    const conversations = useConversations.getState()
    if (workspace.selectedId !== project.id || conversations.projectId !== project.id || !conversations.loaded || conversations.error) {
      await workspace.select(project.id)
    }
    if (!current()) return
    const loaded = useConversations.getState()
    if (useWorkspace.getState().selectedId !== project.id || loaded.projectId !== project.id || !loaded.loaded || loaded.error) throw new Error(loaded.error ?? '暂时无法加载对话，请稍后重试。')
    const view = viewForWorkspace(destination.view, {
      courseId: project.courseId ?? undefined,
      canManage: project.canManage,
      perspective: useAuth.getState().companies.find((company) => company.id === companyId)?.role === 'teacher' ? 'teacher' : 'learner',
    })
    const canManageWorkspace = Boolean(project.courseId && project.canManage && useAuth.getState().companies.find((company) => company.id === companyId)?.role === 'teacher')
    let error = destination.invalidView ? '此页面不存在，已打开对话列表。' : view !== destination.view ? '你没有此页面的访问权限，已打开学习概览。' : null
    let conversationId = destination.conversationId
    if (conversationId && !loaded.list.some((item) => item.id === conversationId)) {
      conversationId = null
      error = '该对话不存在或无权访问，请选择其他对话。'
    }
    if (!destination.explicit) conversationId = loaded.list[0]?.id ?? null
    chatLatency.opened(conversationId)
    useApp.setState({ view, selectedConversationId: conversationId, mobileConversationOpen: destination.explicit && view === 'conversations' && Boolean(conversationId), navigationReady: true, navigationPending: false, navigationError: error, canManageWorkspace })
    writeWebDestination({ projectId: project.id, view, conversationId }, 'replace')
  } catch (reason) {
    if (!current()) return
    // Keep a failed deep link intact so retry can open the intended destination.
    useApp.setState({ navigationReady: true, navigationPending: false, navigationError: userFacingError(reason, '暂时无法打开此页面，请重试。') })
  }
}

export function startWebNavigation(): () => void {
  const restore = () => { void retryWebNavigation() }
  window.addEventListener('popstate', restore)
  restore()
  return () => {
    window.removeEventListener('popstate', restore)
    beginWebNavigation()
    useApp.setState({ navigationReady: false, navigationPending: false, selectedConversationId: null, mobileConversationOpen: false, canManageWorkspace: false })
    useWorkspace.getState().reset()
    useConversations.getState().reset()
  }
}
