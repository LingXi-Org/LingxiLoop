import type { AppBridge, McpUiHostContext } from '@modelcontextprotocol/ext-apps/app-bridge'

/** The pinned GenUI guest consumes each notification as a complete snapshot. */
export function publishGenUiContext(bridge: Pick<AppBridge, 'sendHostContextChange'> | null, context: McpUiHostContext, onError: (error: unknown) => void) {
  if (!bridge) return
  try { void Promise.resolve(bridge.sendHostContextChange({ ...context })).catch(onError) }
  catch (error) { onError(error) }
}

/** Guests may query the actual host mode; only host UI changes that mode. */
export function bindGenUiDisplayMode(bridge: Pick<AppBridge, 'onrequestdisplaymode'>, context: () => McpUiHostContext, assertCurrent: () => void) {
  bridge.onrequestdisplaymode = async () => { assertCurrent(); return { mode: context().displayMode ?? 'inline' } }
}
