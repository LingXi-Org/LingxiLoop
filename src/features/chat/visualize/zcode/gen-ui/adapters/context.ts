import type { AppBridge, McpUiHostContext } from '@modelcontextprotocol/ext-apps/app-bridge'

/** The pinned GenUI guest consumes each notification as a complete snapshot. */
export function publishGenUiContext(bridge: Pick<AppBridge, 'sendHostContextChange'> | null, context: McpUiHostContext, onError: (error: unknown) => void) {
  if (bridge) void bridge.sendHostContextChange({ ...context }).catch(onError)
}
