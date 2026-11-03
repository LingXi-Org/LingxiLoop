import { artifactsApi } from '@/features/artifacts/api'
import { prefetchEditor } from '@/features/artifacts/editor-preload'
import { useWorkspace } from '@/features/knowledge/workspace'
import { useApp } from '@/stores/app'
import { useAuth } from '@/stores/auth'
import { useSurface } from '@/stores/surface'
import { PENDING_DESIGN_ID } from './pending'

const looked = new Map<string, number>()
/** Intent only reads: an existing board's grant starts, nothing is created. */
export function prefetchConversationDesign(conversationId: string) {
  prefetchEditor('design')
  if (Date.now() - (looked.get(conversationId) ?? 0) < 60_000) return
  looked.set(conversationId, Date.now())
  void artifactsApi.getConversationDesign(conversationId)
    .then(design => { if (design) prefetchEditor('design', design.id) }, () => looked.delete(conversationId))
}

/** A slow ensure request belongs to the conversation that initiated it. */
export async function openConversationDesign(conversationId: string, opener?: HTMLElement) {
  const { user, activeCompanyId } = useAuth.getState()
  const projectId = useWorkspace.getState().selectedId
  const placeholder = useSurface.getState().surface?.kind !== 'design'
  if (placeholder) useSurface.getState().openDesign(PENDING_DESIGN_ID, '设计')
  // A later open owns a different surface, even when both use the pending ID.
  const pendingSurface = useSurface.getState().surface
  const placeholderOpen = () => useSurface.getState().surface === pendingSurface
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
  prefetchEditor('design', design.id)
  if (opener?.isConnected) opener.focus({ preventScroll: true })
  useSurface.getState().openDesign(design.id, design.title)
}
