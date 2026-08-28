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
