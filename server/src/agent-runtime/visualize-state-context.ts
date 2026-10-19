import { buildGenUiModelContext } from '../../../src/features/chat/visualize/zcode/shared/gen-ui/contract.js'

/** Preserve upstream sorting, entry budget, JSON escaping and untrusted boundary. */
export function visualizeModelContext(entries: readonly { path: string; state: { modelContent: unknown } }[]): string {
  return buildGenUiModelContext(entries.map(entry => ({ path: entry.path,
    state: { modelContent: entry.state.modelContent, privateContent: null } })))
}
