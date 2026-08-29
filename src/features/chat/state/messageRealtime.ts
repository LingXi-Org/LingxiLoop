import { ws } from '@/api/core/realtime'
import { lingxiIm } from '@/lib/im/wukong'
import { useApp } from '@/stores/app'
import { recoverMessageOutbox } from './messageCommands'
import {
  applyImStreamEvent,
  applyWorkspaceMessageEvent,
  clearTransientMessageState,
  reconcileCommittedMessage,
  resetMessageReconciliation,
} from './messageReconciliation'
import { useMessages } from './messageStore'
import { resetReadReceiptTimers } from './readReceipts'

let workspaceSocketBound = false
let imBound = false

function resetMessageCache(): void {
  resetMessageReconciliation()
  resetReadReceiptTimers()
  useMessages.setState({
    byConvo: {},
    streaming: {},
    typing: {},
    loaded: new Set(),
    loading: new Set(),
    hasMoreOlder: {},
    loadingOlder: new Set(),
    firstItemIndex: {},
    errors: {},
    readReceipts: {},
  })
}

function reconcileWorkspaceSocketGap(): void {
  const activeConversationId = useApp.getState().selectedConversationId
  clearTransientMessageState()
  useMessages.setState((state) => ({
    streaming: {},
    typing: {},
    loaded: new Set(
      activeConversationId && state.loaded.has(activeConversationId)
        ? [activeConversationId]
        : [],
    ),
  }))
  if (activeConversationId) {
    void useMessages.getState().reloadConversation(activeConversationId)
  }
}

export function bootMessagesStream(): void {
  resetMessageCache()
  if (!imBound) {
    imBound = true
    lingxiIm.subscribe(reconcileCommittedMessage)
    lingxiIm.subscribeEvent(applyImStreamEvent)
  }
  void lingxiIm.connect().catch((error) => console.warn('[im] connect failed', error))
  void recoverMessageOutbox()

  if (workspaceSocketBound) return
  workspaceSocketBound = true
  ws.connect()
  ws.on((event) => {
    if (event.type === 'hello') {
      reconcileWorkspaceSocketGap()
      return
    }
    if (event.type === 'message.new' || event.type === 'message.delta') return
    applyWorkspaceMessageEvent(event)
  })
}
