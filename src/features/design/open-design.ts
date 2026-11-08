import { artifactsApi } from '@/features/artifacts/api'
import { prefetchEditor } from '@/features/artifacts/editor-preload'
import { useWorkspace } from '@/features/knowledge/workspace'
import { useApp } from '@/stores/app'
import { useAuth } from '@/stores/auth'
import { useSurface } from '@/stores/surface'
import { PENDING_DESIGN_ID } from './pending'

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
  prefetchEditor()
  if (opener?.isConnected) opener.focus({ preventScroll: true })
  useSurface.getState().openDesign(design.id, design.title)
}

/** Restore a private link by reading the conversation's existing design; never create one. */
export async function restoreLinkedConversationDesign(conversationId:string,artifactId:string,signal:AbortSignal){
  const {user,activeCompanyId}=useAuth.getState(),projectId=useWorkspace.getState().selectedId,surface=useSurface.getState().surface
  if(signal.aborted||useApp.getState().selectedConversationId!==conversationId)return
  const design=await artifactsApi.getConversationDesign(conversationId)
  if(signal.aborted||useAuth.getState().user?.id!==user?.id||useAuth.getState().activeCompanyId!==activeCompanyId||useWorkspace.getState().selectedId!==projectId||useApp.getState().selectedConversationId!==conversationId||useSurface.getState().surface!==surface)return
  if(!design||design.id!==artifactId)throw new Error('该设计不存在或无权访问，请从会话重新打开。')
  prefetchEditor()
  useSurface.getState().openDesign(design.id,design.title)
}
