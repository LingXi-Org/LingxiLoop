import { artifactsApi } from '@/features/artifacts/api'
import { useWorkspace } from '@/features/knowledge/workspace'
import { useApp } from '@/stores/app'
import { useAuth } from '@/stores/auth'
import { useSurface } from '@/stores/surface'

/** A slow ensure request belongs to the conversation that initiated it. */
export async function openConversationDesign(conversationId: string, opener?: HTMLElement) {
  const { user, activeCompanyId } = useAuth.getState()
  const projectId = useWorkspace.getState().selectedId
  const design = await artifactsApi.ensureConversationDesign(conversationId)
  if (useAuth.getState().user?.id !== user?.id || useAuth.getState().activeCompanyId !== activeCompanyId
    || useWorkspace.getState().selectedId !== projectId || useApp.getState().selectedConversationId !== conversationId) return
  if (opener?.isConnected) opener.focus({ preventScroll: true })
  useSurface.getState().openDesign(design.id, design.title)
}
