import type { LingxiMessageV1 } from '../agent-os/types.js'
import type { ImMessageEnvelope } from './messages-application.js'
import { imMessagesApplication } from './messages-facade.js'

export function getAgentChannelHistory(input: {
  companyId: string
  agentId: string
  channelId: string
  limit?: number
  beforeSequence?: number
}) {
  return imMessagesApplication.history({
    companyId: input.companyId,
    userId: input.agentId,
    channelId: input.channelId,
    limit: input.limit ?? 200,
    beforeSequence: input.beforeSequence ?? 0,
  })
}

export async function sendAgentChannelMessage(input: {
  companyId: string
  agentId: string
  channelId: string
  clientNonce: string
  payload: LingxiMessageV1
}): Promise<
  | { kind: 'channel_not_found' }
  | { kind: 'nonce_conflict' }
  | { kind: 'verbatim_peer'; peer: ImMessageEnvelope }
  | { kind: 'accepted'; duplicate: boolean; messageId: string; sequence: number }
> {
  const result = await imMessagesApplication.acceptAgentMessage({
    companyId: input.companyId,
    userId: input.agentId,
    channelId: input.channelId,
    clientNonce: input.clientNonce,
    payload: input.payload,
    rejectVerbatimPeerBody: input.payload.kind === 'text' ? input.payload.body : undefined,
  })
  if (result.kind === 'verbatim_peer') {
    return { kind: 'verbatim_peer' as const, peer: result.peer }
  }
  if (result.kind !== 'accepted') return result
  const messageId = String(result.echo.messageId ?? '')
  const sequence = Number(result.echo.messageSeq)
  if (!messageId || !Number.isSafeInteger(sequence) || sequence <= 0) {
    throw new Error('WuKong send acceptance returned an invalid echo')
  }
  return { kind: 'accepted', duplicate: result.duplicate, messageId, sequence }
}
