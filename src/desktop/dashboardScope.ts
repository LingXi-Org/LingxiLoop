import type { LearningSpace } from '@/features/learning/contracts'
import { selectLearningSpace, useWorkspace } from '@/features/knowledge/workspace'
import { useConversations } from '@/features/conversations/store'
import { viewForWorkspace } from '@/features/learning/dashboard/navigation'
import { useApp } from '@/stores/app'
import { useSurface } from '@/stores/surface'

export interface LearningSpaceScopes {
  courses: LearningSpace[]
  visible: LearningSpace[]
}

export function getLearningSpaceScopes(spaces: LearningSpace[]): LearningSpaceScopes {
  const visible = spaces.filter((space) => space.status !== 'ARCHIVED' && space.status !== 'DELETED')
  return { courses: visible, visible }
}

export async function switchLearningWorkspace(target: LearningSpace): Promise<void> {
  const previous = useWorkspace.getState()
  if (target.companyId === previous.companyId && target.projectId === previous.selectedId) return
  const { view, selectedConversationId } = useApp.getState()
  useSurface.getState().closeSurface()
  try {
    await selectLearningSpace({ companyId: target.companyId, projectId: target.projectId })
    useApp.getState().setView(viewForWorkspace(view, target))
  } catch (reason) {
    if (previous.companyId && previous.selectedId) {
      try {
        await selectLearningSpace({ companyId: previous.companyId, projectId: previous.selectedId })
        if (selectedConversationId && useConversations.getState().list.some((item) => item.id === selectedConversationId)) {
          useApp.getState().selectConversation(selectedConversationId)
        }
        useApp.getState().setView(view)
      } catch {
        useWorkspace.getState().leave()
        throw new Error('工作区切换失败，原工作区也暂时不可用，请重新选择。')
      }
    } else {
      useWorkspace.getState().leave()
    }
    throw reason
  }
}
