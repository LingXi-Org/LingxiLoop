import { documentCollaboration } from './collaboration-facade.js'
import { documentsApplication } from './facade.js'
import { createDocumentTools } from './agent-tools.js'
import { normalizeStorageKey, storageKeyFromPublicUrl, signedUrlExpiresSoon, storage } from '../../storage.js'
export { createDocumentTools } from './agent-tools.js'
export const documentTools = createDocumentTools({ normalizeKey: value => normalizeStorageKey(value ?? ''),
  keyFromPublicUrl: value => storageKeyFromPublicUrl(value ?? ''), signedUrlExpiresSoon, publicUrl: key => storage.publicUrl(key) })
export { projectDocumentIds } from './collaboration-facade.js'

export const subscribe = documentCollaboration.subscribe
export const unsubscribe = documentCollaboration.unsubscribe
export const applyLocalUpdate = documentCollaboration.applyLocalUpdate
export const broadcastAwareness = documentCollaboration.broadcastAwareness
export const bootDocumentBus = documentCollaboration.boot
export const instanceOrigin = documentCollaboration.instanceOrigin
export const readDocumentText = documentCollaboration.readDocumentText
export const applyAgentEdit = documentCollaboration.applyAgentEdit

export const listAgentDocuments = documentsApplication.list.bind(documentsApplication)
export const getAgentDocument = documentsApplication.get.bind(documentsApplication)
export const agentDocumentExists = documentsApplication.exists.bind(documentsApplication)
export const createAgentDocument = documentsApplication.createForAgent.bind(documentsApplication)
export const listRecentAgentDocumentCreations = documentsApplication.listRecentCreationsByOthers.bind(documentsApplication)
export const readAgentDocument = documentsApplication.readForAgent.bind(documentsApplication)
export const editAgentDocument = documentsApplication.editForAgent.bind(documentsApplication)
export const renameAgentDocument = documentsApplication.rename.bind(documentsApplication)
export const deleteAgentDocument = documentsApplication.deleteForAgent.bind(documentsApplication)

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
