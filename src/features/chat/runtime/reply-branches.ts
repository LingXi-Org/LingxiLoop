import type { ThreadMessage } from '@assistant-ui/react'
import type { ReplyBranchSelection } from '@/stores/conversationUi'
import { getLingxiMessageMetadata as metadata } from './model'
import { projectMessageGroups } from './converter'

/** Keep the IM timeline intact; only explicit regenerations share a visible reply slot. */
// shortcut: versions use loaded history; fetch quoted ancestors when branch navigation must span unloaded pages.
export function projectReplyBranches(messages: readonly ThreadMessage[], selections: Record<string, ReplyBranchSelection>): ThreadMessage[] {
  const byClient = new Map(messages.map(message => [metadata(message).clientMessageId, message]))
  const requests = new Map<string, ThreadMessage>()
  for (const message of messages) {
    const value = metadata(message), target = typeof value.regenerateOfClientMsgNo === 'string' ? byClient.get(value.regenerateOfClientMsgNo) : undefined
    if (message.role === 'user' && target?.role === 'assistant' && metadata(target).senderKind === 'agent'
      && value.conversationId === metadata(target).conversationId && value.quotedMessageId === value.regenerateOfClientMsgNo
      && Array.isArray(value.mentionedIds) && value.mentionedIds.length === 1 && value.mentionedIds[0] === metadata(target).senderId) {
      requests.set(value.clientMessageId, target)
    }
  }
  const parents = new Map<string, ThreadMessage>()
  for (const message of messages) {
    const value = metadata(message)
    const source = typeof value.sourceRef === 'string' ? value.sourceRef : value.harness || !value.runId ? value.threadRootId : null
    const parent = source && requests.get(source)
    if (message.role === 'assistant' && parent && value.senderId === metadata(parent).senderId
      && value.conversationId === metadata(parent).conversationId) parents.set(message.id, parent)
  }
  function rootOf(message: ThreadMessage): ThreadMessage | undefined {
    const seen = new Set<string>()
    let current = message
    while (parents.has(current.id)) {
      if (seen.has(current.id)) return undefined
      seen.add(current.id)
      current = parents.get(current.id)!
    }
    return current
  }
  const groups = new Map<string, ThreadMessage[]>()
  for (const message of messages) {
    if (!parents.has(message.id)) continue
    const root = rootOf(message)
    if (!root) continue
    const group = groups.get(root.id) ?? [root]
    group.push(message)
    groups.set(root.id, group)
  }
  const replacements = new Map<string, ThreadMessage>(), hidden = new Set<string>()
  for (const message of messages) if (requests.has(metadata(message).clientMessageId) && rootOf(requests.get(metadata(message).clientMessageId)!)) hidden.add(message.id)
  for (const [rootId, group] of groups) {
    const root = metadata(group[0]), key = JSON.stringify([root.conversationId, rootId])
    const latest = group.at(-1)!, selection = selections[key]
    const chosen = selection?.latestId === latest.id ? group.findIndex(message => message.id === selection.messageId) : -1
    const index = chosen < 0 ? group.length - 1 : chosen, selected = group[index]
    replacements.set(rootId, { ...selected, metadata: { ...selected.metadata, custom: { ...metadata(selected), quote: root.quote, replyBranches: {
      key, rootId: root.clientMessageId, threadRootId: root.threadRootId,
      ids: group.map(message => message.id), clientIds: group.map(message => metadata(message).clientMessageId), index,
    } } } } as ThreadMessage)
    for (const variant of group.slice(1)) hidden.add(variant.id)
  }
  return projectMessageGroups(messages.filter(message => !hidden.has(message.id)).map(message => {
    const replacement = replacements.get(message.id)
    if (replacement) return replacement
    return metadata(message).replyBranches === undefined ? message : { ...message, metadata: { ...message.metadata,
      custom: { ...metadata(message), replyBranches: undefined } } } as ThreadMessage
  }))
}
