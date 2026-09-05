/** Authoritative membership activity published through WuKongIM. */
import { randomUUID } from 'node:crypto'
import { sendSystemChannelMessage } from '../im/public.js'

export type MembershipKind = 'joined' | 'left' | 'kicked'

export async function postMembershipSystemMessage(args: {
  conversationId: string
  companyId: string
  actorId: string
  kind: MembershipKind
  participantId: string
}): Promise<{ messageId: string; sequence: number }> {
  const clientNonce = `membership:${randomUUID()}`
  const body = JSON.stringify({
    kind: args.kind,
    participantId: args.participantId,
    actorId: args.actorId,
  })
  const result = await sendSystemChannelMessage({
    companyId: args.companyId,
    actorId: args.actorId,
    channelId: args.conversationId,
    clientNonce,
    payload: {
      version: 1,
      kind: 'system',
      clientMsgNo: clientNonce,
      body,
      data: { membershipKind: args.kind, participantId: args.participantId, actorId: args.actorId },
    },
  })
  if (result.kind === 'channel_not_found') throw new Error('membership channel is not authoritative')
  if (result.kind === 'nonce_conflict') throw new Error('membership message identity conflict')
  return { messageId: result.messageId, sequence: result.sequence }
}
