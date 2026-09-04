import {
  getAgentConversationMetadata,
  setAgentConversationTitle,
  setAgentConversationTopic,
} from '../../modules/conversations/public.js'
import { resolveAs } from '../cli-identity.js'
import { type ParsedArgs, unescapeChat } from '../cli-parse.js'
import type { CliResult, CliSideEffect } from '../cli-result.js'

interface ConversationMetadataCommandDependencies {
  ok(text: string, sideEffects?: CliSideEffect[]): CliResult
  err(text: string, code?: number): CliResult
}

export function createConversationMetadataCommands(
  dependencies: ConversationMetadataCommandDependencies,
) {
  const { ok, err } = dependencies

  async function cmdTopicRead(parsed: ParsedArgs): Promise<CliResult> {
    const conversationId = parsed.positional[0]
    if (!conversationId) return err('usage: topic <conversation_id>')
    const agentId = resolveAs(parsed)
    try {
      const metadata = await getAgentConversationMetadata(agentId, conversationId)
      return metadata.topic ? ok(metadata.topic) : ok(`(no topic set on "${metadata.title}")`)
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error))
    }
  }

  async function cmdTopicSet(parsed: ParsedArgs): Promise<CliResult> {
    const conversationId = parsed.positional[0]
    if (!conversationId) {
      return err('usage: topic-set <conversation_id> "<text>"  (empty body clears the topic)')
    }
    const agentId = resolveAs(parsed)
    const raw = unescapeChat(parsed.positional.slice(1).join(' ')).trim()
    const topic = raw.length > 0 ? raw.slice(0, 200) : null
    try {
      const result = await setAgentConversationTopic(agentId, conversationId, topic)
      return ok(topic ? `topic set: "${topic}"` : '(topic cleared)', [{
        event: 'conversation.topic_updated',
        command: 'topic-set',
        conversationId,
        actorId: agentId,
        companyId: result.companyId,
        topic,
        visibleToUser: true,
      }])
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error))
    }
  }

  async function cmdRename(parsed: ParsedArgs): Promise<CliResult> {
    const conversationId = parsed.positional[0]
    if (!conversationId) return err('usage: rename <conversation_id> "<new title>"')
    const title = unescapeChat(parsed.positional.slice(1).join(' ')).trim().slice(0, 80)
    if (!title) return err('rename requires a non-empty title')
    const agentId = resolveAs(parsed)
    const expectedRaw = parsed.flags['if-equals']
    const expectedTitle = typeof expectedRaw === 'string'
      ? unescapeChat(expectedRaw).trim().slice(0, 80)
      : undefined
    try {
      const result = await setAgentConversationTitle(
        agentId,
        conversationId,
        title,
        expectedTitle,
      )
      if (!result.changed) return ok(`(no-op — title was already "${title}")`)
      return ok(`renamed to "${title}" (${conversationId})`, [{
        event: 'conversation.renamed',
        command: 'rename',
        conversationId,
        actorId: agentId,
        companyId: result.companyId,
        title,
        visibleToUser: true,
      }])
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return err(message === 'only group chats can be renamed'
        ? `only group chats can be renamed (${conversationId} is not a group)`
        : message)
    }
  }

  return { cmdRename, cmdTopicRead, cmdTopicSet }
}
