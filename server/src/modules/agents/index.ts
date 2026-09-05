/** Public Agents domain facade. Cross-domain callers import only this file. */
export {
  agentApplication,
  getAgentCliIdentity,
  listAgentCliParticipants,
  listAgentCliStatuses,
} from './facade.js'
export { participantPresenceApplication } from './presence-facade.js'
