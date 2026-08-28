import { z } from 'zod'
import type { PollPayload } from '../../db/schema.js'
import type { PollUpdatedEvent } from '../../redis.js'

export const createPollRequestSchema = z.object({
  clientRequestId: z.string().uuid(),
  conversationId: z.string().trim().min(1),
  question: z.string().trim().min(1).max(280),
  mode: z.enum(['single', 'multi']).default('single'),
  options: z.array(z.string()).min(2).max(10),
  expiresInMinutes: z.number().positive().nullable().optional(),
}).strict()

export const votePollRequestSchema = z.object({
  optionIds: z.array(z.string().trim().min(1)).max(10),
}).strict()

export interface PollScope {
  companyId: string
  actorId: string
}

export interface CreatePollCommand extends PollScope {
  conversationId: string
  question: string
  mode: 'single' | 'multi'
  options: string[]
  expiresInMinutes?: number | null
  idempotencyKey?: string
}

export interface CastVoteCommand extends PollScope {
  messageId: string
  voterKind: 'human' | 'agent'
  optionIds: string[]
}

export interface ClosePollCommand {
  messageId: string
  companyId: string
  actorId: string | null
  reason: 'manual' | 'expired'
}

export interface CreatedPoll {
  /** Stable WuKong client_msg_no used by voting APIs and the renderer. */
  messageId: string
  sequence: number
  poll: PollPayload
}

export interface PollRow {
  poll_client_msg_no: string
  channel_id: string
  channel_type: number
  company_id: string
  author_id: string
  request_fingerprint: string
  poll: PollPayload
  revision: string
  published_revision: string
}

export interface PollTallies {
  tallies: PollUpdatedEvent['tallies']
}

export type PollSnapshot = Omit<PollRow, 'request_fingerprint' | 'published_revision'> & PollTallies

export type PollErrorCode = 'invalid' | 'forbidden' | 'not_found' | 'conflict' | 'internal'

export class PollApplicationError extends Error {
  constructor(readonly code: PollErrorCode, message: string) {
    super(message)
  }
}
