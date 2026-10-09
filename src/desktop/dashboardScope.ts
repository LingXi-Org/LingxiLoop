import type { LearningSpace } from '@/features/learning/contracts'
import { selectLearningSpace, useWorkspace } from '@/features/knowledge/workspace'
import { useConversations } from '@/features/conversations/store'
import { viewForWorkspace } from '@/features/learning/dashboard/navigation'
import { useApp } from '@/stores/app'
import { useSurface } from '@/stores/surface'
import { currentWebNavigation, isCurrentWebNavigation } from '@/lib/webNavigation'
import type { ViewKey } from '@/types'

export interface LearningSpaceScopes {
  courses: LearningSpace[]
  visible: LearningSpace[]
}

export function getLearningSpaceScopes(spaces: LearningSpace[]): LearningSpaceScopes {
  const visible = spaces.filter((space) => space.status !== 'ARCHIVED' && space.status !== 'DELETED')
  return { courses: visible, visible }
}

export async function switchLearningWorkspace(target: LearningSpace, requestedView?: ViewKey['view']): Promise<void> {
  const previous = useWorkspace.getState()
  if (target.companyId === previous.companyId && target.projectId === previous.selectedId) {
    if (requestedView) useApp.getState().setView(viewForWorkspace(requestedView, target))
    return
  }
  const { view, selectedConversationId, mobileConversationOpen } = useApp.getState()
  useSurface.getState().closeSurface()
  const selection = selectLearningSpace({ companyId: target.companyId, projectId: target.projectId })
  const epoch = currentWebNavigation()
  try {
    await selection
    if (!isCurrentWebNavigation(epoch)) return
    useApp.getState().setView(viewForWorkspace(requestedView ?? view, target))
  } catch (reason) {
    if (!isCurrentWebNavigation(epoch)) return
    if (previous.companyId && previous.selectedId) {
      let restorationEpoch = epoch
      try {
        const restoration = selectLearningSpace({ companyId: previous.companyId, projectId: previous.selectedId })
        restorationEpoch = currentWebNavigation()
        await restoration
        if (!isCurrentWebNavigation(restorationEpoch)) return
        const restored = selectedConversationId && useConversations.getState().list.some((item) => item.id === selectedConversationId) ? selectedConversationId : null
        useApp.setState({ view, selectedConversationId: restored, mobileConversationOpen: Boolean(restored) && mobileConversationOpen, navigationPending: false })
      } catch {
        if (!isCurrentWebNavigation(restorationEpoch)) return
        useWorkspace.getState().leave()
        throw new Error('工作区切换失败，原工作区也暂时不可用，请重新选择。')
      }
    } else {
      useWorkspace.getState().leave()
    }
    throw reason
  }
}
