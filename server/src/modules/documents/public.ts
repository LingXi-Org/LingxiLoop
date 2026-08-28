import { documentCollaboration } from './collaboration-facade.js'
import { documentsApplication } from './facade.js'
import { documentMentionApplication } from './mention-facade.js'
export { projectDocumentIds } from './collaboration-facade.js'

export const subscribe = documentCollaboration.subscribe
export const unsubscribe = documentCollaboration.unsubscribe
export const applyLocalUpdate = documentCollaboration.applyLocalUpdate
export const broadcastAwareness = documentCollaboration.broadcastAwareness
export const bootDocumentBus = documentCollaboration.boot
export const instanceOrigin = documentCollaboration.instanceOrigin
export const readDocumentText = documentCollaboration.readDocumentText
export const applyAgentEdit = documentCollaboration.applyAgentEdit

export function documentCollaborationCompanyFor(
  documentId: string,
  userId: string,
  writable = false,
): Promise<string | null> {
  return documentsApplication.collaborationCompanyFor(documentId, userId, writable)
}

export function notifyDocumentMention(args: {
  documentId: string
  companyId: string
  mentionerId: string
  requestedIds: string[]
}): Promise<{ deliveryId: string | null; mentionedIds: string[] }> {
  return documentMentionApplication.notify(args)
}

export {
  isAnchoredImagePlacement,
  type DocSubscriber,
} from './collaboration-application.js'

export type {
  AgentDocumentEditOperation,
  AgentDocumentEditResult,
  AgentImageDeleteMatch,
  AgentImagePlacement,
} from './contracts.js'
