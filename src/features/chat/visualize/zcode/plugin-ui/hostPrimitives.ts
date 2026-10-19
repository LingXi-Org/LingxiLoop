export { createPluginUiPagePlane } from './adapters/pluginUiPagePlane'
export { createPluginUiMessagePortTransport } from './adapters/messagePortTransport'
export { readPluginUiStyleVariables } from './adapters/readPluginUiStyleVariables'
export { sandboxPages, type SandboxPageOwner } from './adapters/sandboxPageOwners'
import type { GenUiCardTarget } from '../gen-ui/contract'
type Actions = {sendFollowUp(input:{prompt:string;source:unknown}):Promise<void>}
const actions = new Map<string, Map<symbol,Actions>>()
const key = (target: GenUiCardTarget) => JSON.stringify([target.workspaceIdentity,target.workspacePath,target.sessionId,target.path,target.instanceKey])
export function getPluginUiSessionActions(target: GenUiCardTarget) { return [...(actions.get(key(target))?.values() ?? [])].at(-1) ?? null }
export function registerGenUiActions(target: GenUiCardTarget, value: Actions) {
  const id=Symbol(), scope=key(target), leases=actions.get(scope) ?? new Map<symbol,Actions>()
  leases.set(id,value);actions.set(scope,leases)
  return () => {leases.delete(id);if(!leases.size)actions.delete(scope)}
}
