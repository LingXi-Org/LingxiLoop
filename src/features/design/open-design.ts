import { artifactsApi } from '@/features/artifacts/api'
import { useWorkspace } from '@/features/knowledge/workspace'
import { useApp } from '@/stores/app'
import { useAuth } from '@/stores/auth'
import { useSurface } from '@/stores/surface'
import { PENDING_DESIGN_ID } from './pending'

const placeholderOpen = () => {
  const surface = useSurface.getState().surface
  return surface?.kind === 'design' && surface.artifactId === PENDING_DESIGN_ID
}

/** A slow ensure request belongs to the conversation that initiated it. */
export async function openConversationDesign(conversationId: string, opener?: HTMLElement) {
  const { user, activeCompanyId } = useAuth.getState()
  const projectId = useWorkspace.getState().selectedId
  const placeholder = useSurface.getState().surface?.kind !== 'design'
  if (placeholder) useSurface.getState().openDesign(PENDING_DESIGN_ID, '设计')
  let design
  try {
    design = await artifactsApi.ensureConversationDesign(conversationId)
  } catch (error) {
    if (placeholder && placeholderOpen()) useSurface.getState().closeDesign()
    throw error
  }
  if (useAuth.getState().user?.id !== user?.id || useAuth.getState().activeCompanyId !== activeCompanyId
    || useWorkspace.getState().selectedId !== projectId || useApp.getState().selectedConversationId !== conversationId) {
    if (placeholder && placeholderOpen()) useSurface.getState().closeDesign()
    return
  }
  // Closing the placeholder while the board was being prepared is a decision.
  if (placeholder && !placeholderOpen()) return
  if (opener?.isConnected) opener.focus({ preventScroll: true })
  useSurface.getState().openDesign(design.id, design.title)
}
