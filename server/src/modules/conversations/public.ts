import { conversationsApplication } from './facade.js'

export function openDirectConversationForDocumentMention(args: {
  companyId: string
  projectId: string
  mentionerId: string
  agentId: string
}): Promise<{ id: string; created: boolean }> {
  return conversationsApplication.openDirectForDocumentMention({
    companyId: args.companyId,
    projectId: args.projectId,
    userId: args.mentionerId,
  }, args.agentId)
}

export function authorizeConversationForDocumentShare(args: {
  companyId: string
  projectId: string
  actorId: string
  conversationId: string
}): Promise<'allowed' | 'not_found' | 'not_member'> {
  return conversationsApplication.authorizeDocumentShare({
    companyId: args.companyId,
    projectId: args.projectId,
    userId: args.actorId,
  }, args.conversationId)
}
