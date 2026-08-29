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

export function notifyDocumentMention(args: {
  documentId: string
  companyId: string
  mentionerId: string
  requestedIds: string[]
}): Promise<{ deliveryId: string | null; mentionedIds: string[] }> {
  return documentMentionApplication.notify(args)
}

export const listAgentDocuments = documentsApplication.list.bind(documentsApplication)
export const getAgentDocument = documentsApplication.get.bind(documentsApplication)
export const agentDocumentExists = documentsApplication.exists.bind(documentsApplication)
export const createAgentDocument = documentsApplication.createForAgent.bind(documentsApplication)
export const listRecentAgentDocumentCreations = documentsApplication.listRecentCreationsByOthers.bind(documentsApplication)
export const readAgentDocument = documentsApplication.readForAgent.bind(documentsApplication)
export const editAgentDocument = documentsApplication.editForAgent.bind(documentsApplication)
export const renameAgentDocument = documentsApplication.rename.bind(documentsApplication)
export const deleteAgentDocument = documentsApplication.delete.bind(documentsApplication)

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
