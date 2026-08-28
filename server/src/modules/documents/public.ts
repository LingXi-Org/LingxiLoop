import { documentCollaboration } from './collaboration-facade.js'
export { projectDocumentIds } from './collaboration-facade.js'

export const subscribe = documentCollaboration.subscribe
export const unsubscribe = documentCollaboration.unsubscribe
export const applyLocalUpdate = documentCollaboration.applyLocalUpdate
export const broadcastAwareness = documentCollaboration.broadcastAwareness
export const bootDocumentBus = documentCollaboration.boot
export const instanceOrigin = documentCollaboration.instanceOrigin
export const readDocumentText = documentCollaboration.readDocumentText
export const applyAgentEdit = documentCollaboration.applyAgentEdit

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
