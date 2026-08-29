import { conversationsApplication } from './facade.js'

export function openDirectConversationForNewAgent(args: {
  companyId: string
  userId: string
}, agentId: string): Promise<{ id: string; created: boolean }> {
  return conversationsApplication.openDirectForNewAgent(args, agentId)
}

export function seedMemberDirectConversations(args: {
  companyId: string
  memberId: string
}): Promise<void> {
  return conversationsApplication.seedMemberDirects({
    companyId: args.companyId,
    userId: args.memberId,
  })
}

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

export function getAgentConversationMetadata(agentId: string, conversationId: string) {
  return conversationsApplication.getAgentMetadata(agentId, conversationId)
}

export function addAgentConversationMember(agentId: string, conversationId: string, participantId: string) {
  return conversationsApplication.addAgentMember(agentId, conversationId, participantId)
}

export function leaveAgentConversation(agentId: string, conversationId: string) {
  return conversationsApplication.leaveAgentConversation(agentId, conversationId)
}

export function setAgentConversationTopic(
  agentId: string,
  conversationId: string,
  topic: string | null,
) {
  return conversationsApplication.setAgentTopic(agentId, conversationId, topic)
}

export function setAgentConversationTitle(
  agentId: string,
  conversationId: string,
  title: string,
  expectedTitle?: string,
) {
  return conversationsApplication.setAgentTitle(agentId, conversationId, title, expectedTitle)
}

export function listAgentConversationMutes(agentId: string) {
  return conversationsApplication.listAgentMutes(agentId)
}

export function setAgentConversationMuted(
  agentId: string,
  conversationId: string,
  mute: boolean,
  until: Date | null,
) {
  return conversationsApplication.setAgentMuted(agentId, conversationId, mute, until)
}
