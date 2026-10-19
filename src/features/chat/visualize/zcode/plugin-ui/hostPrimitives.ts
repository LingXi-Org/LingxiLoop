export { createPluginUiPagePlane } from './adapters/pluginUiPagePlane'
export { createPluginUiMessagePortTransport } from './adapters/messagePortTransport'
export { readPluginUiStyleVariables } from './adapters/readPluginUiStyleVariables'
export { sandboxPages, type SandboxPageOwner } from './adapters/sandboxPageOwners'
import type { GenUiCardTarget } from '../gen-ui/contract'
const actions = new Map<string, {sendFollowUp(input:{prompt:string;source:unknown}):Promise<void>}>()
const key = (target: GenUiCardTarget) => JSON.stringify([target.workspaceIdentity,target.workspacePath,target.sessionId,target.path,target.instanceKey])
export function getPluginUiSessionActions(target: GenUiCardTarget) { return actions.get(key(target)) ?? null }
export function registerGenUiActions(target: GenUiCardTarget, value: {sendFollowUp(input:{prompt:string;source:unknown}):Promise<void>}) {
  actions.set(key(target),value)
  return () => {if(actions.get(key(target))===value) actions.delete(key(target))}
}
