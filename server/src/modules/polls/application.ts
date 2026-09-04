import { createHash, randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import type { Queryable } from '../../db/queryable.js'
import type { PollUpdatedEvent } from '../../redis.js'
import type {
  CastVoteCommand,
  ClosePollCommand,
  CreatedPoll,
  CreatePollCommand,
  PollOption,
  PollPayload,
  PollRow,
  PollSnapshot,
} from './contracts.js'
import { PollApplicationError } from './contracts.js'
import {
  bumpPollRevision,
  channelBinding,
  expiredPolls,
  findPoll,
  insertPoll,
  lockPoll,
  pendingPollPublications,
  pollTallies,
  recordPublishedSequence,
  replaceVotes,
} from './repository.js'

const MAX_OPTIONS = 10
const MIN_OPTIONS = 2
const MAX_QUESTION_LEN = 280
const MAX_OPTION_LEN = 120

function stableSuffix(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function validatePoll(input: CreatePollCommand): PollPayload {
  const question = input.question.trim()
  if (!question) throw new PollApplicationError('invalid', 'question is required')
  if (question.length > MAX_QUESTION_LEN) {
    throw new PollApplicationError('invalid', `question too long (max ${MAX_QUESTION_LEN} chars)`)
  }
  const options: PollOption[] = []
  const seen = new Set<string>()
  for (const raw of input.options) {
    const text = String(raw ?? '').trim()
    if (!text) continue
    if (text.length > MAX_OPTION_LEN) {
      throw new PollApplicationError('invalid', `option too long (max ${MAX_OPTION_LEN} chars)`)
    }
    const normalized = text.toLocaleLowerCase()
    if (seen.has(normalized)) continue
    seen.add(normalized)
    const optionKey = input.idempotencyKey
      ? `${input.companyId}:${input.idempotencyKey}:${options.length}`
      : randomUUID()
    options.push({ id: `opt-${stableSuffix(optionKey).slice(0, 12)}`, text })
    if (options.length >= MAX_OPTIONS) break
  }
  if (options.length < MIN_OPTIONS) {
    throw new PollApplicationError('invalid', `need at least ${MIN_OPTIONS} distinct options`)
  }
  const expiresAt = input.expiresInMinutes != null && input.expiresInMinutes > 0
    ? new Date(Date.now() + Math.floor(input.expiresInMinutes) * 60_000).toISOString()
    : null
  return {
    question,
    mode: input.mode,
    options,
    expiresAt,
    closedAt: null,
    closedReason: null,
  }
}

function requestFingerprint(input: CreatePollCommand, poll: PollPayload): string {
  const expiresInMinutes = input.expiresInMinutes != null && input.expiresInMinutes > 0
    ? Math.floor(input.expiresInMinutes)
    : null
  return stableSuffix(JSON.stringify({
    conversationId: input.conversationId,
    actorId: input.actorId,
    question: poll.question,
    mode: poll.mode,
    options: poll.options.map((option) => option.text),
    expiresInMinutes,
  }))
}

export interface PollInfrastructure {
  transaction<T>(work: (db: PoolClient) => Promise<T>): Promise<T>
  publishSnapshot(
    row: PollRow,
    tallies: PollUpdatedEvent['tallies'],
    actorId: string | null,
    initial: boolean,
  ): Promise<number>
}

export class PollApplication {
  constructor(private readonly db: Queryable, private readonly infra: PollInfrastructure) {}

  async conversationId(companyId: string, messageId: string): Promise<string | null> {
    const row = await findPoll(this.db, companyId, messageId)
    return row?.channel_id ?? null
  }

  async create(input: CreatePollCommand): Promise<CreatedPoll> {
    const poll = validatePoll(input)
    const binding = await channelBinding(this.db, input.companyId, input.conversationId)
    if (!binding) throw new PollApplicationError('not_found', 'channel not found')
    if (!binding.members.includes(input.actorId)) {
      throw new PollApplicationError('forbidden', 'not a member of this channel')
    }
    const messageId = input.idempotencyKey
      ? `poll-${stableSuffix(`${input.companyId}:${input.idempotencyKey}`).slice(0, 32)}`
      : `poll-${randomUUID()}`
    let row: PollRow = {
      poll_client_msg_no: messageId,
      channel_id: input.conversationId,
      channel_type: binding.channelType,
      company_id: input.companyId,
      author_id: input.actorId,
      request_fingerprint: requestFingerprint(input, poll),
      poll,
      revision: '1',
      published_revision: '0',
    }
    const inserted = await insertPoll(this.db, row)
    if (!inserted) {
      const existing = await findPoll(this.db, input.companyId, messageId)
      if (!existing || existing.request_fingerprint !== row.request_fingerprint) {
        throw new PollApplicationError('conflict', 'poll idempotency conflict')
      }
      row = existing
    }
    const sequence = await this.publish(row, input.actorId)
    if (!await recordPublishedSequence(this.db, input.companyId, messageId, Number(row.revision), sequence)) {
      throw new PollApplicationError('internal', 'poll vanished after publish')
    }
    return { messageId, sequence, poll: row.poll }
  }

  async vote(input: CastVoteCommand): Promise<PollUpdatedEvent> {
    const requested = [...new Set(input.optionIds.filter(Boolean))]
    const updated = await this.infra.transaction(async (db) => {
      const row = await lockPoll(db, input.companyId, input.messageId)
      if (!row) throw new PollApplicationError('not_found', 'poll not found')
      if (row.poll.closedAt) throw new PollApplicationError('conflict', 'poll is closed')
      const binding = await channelBinding(db, input.companyId, row.channel_id)
      if (!binding?.members.includes(input.actorId)) {
        throw new PollApplicationError('forbidden', 'not a member of this channel')
      }
      if (row.poll.mode === 'single' && requested.length > 1) {
        throw new PollApplicationError('invalid', 'single-choice poll accepts at most one option')
      }
      const validOptions = new Set(row.poll.options.map((option) => option.id))
      for (const optionId of requested) {
        if (!validOptions.has(optionId)) throw new PollApplicationError('invalid', `unknown option: ${optionId}`)
      }
      await replaceVotes(db, {
        companyId: input.companyId,
        messageId: input.messageId,
        voterParticipantId: input.actorId,
        voterKind: input.voterKind,
        optionIds: requested,
      })
      const next = await bumpPollRevision(db, input.companyId, input.messageId)
      if (!next) throw new PollApplicationError('internal', 'poll vanished mid-update')
      return next
    })
    const event = await this.updatedEvent(input.companyId, input.messageId, input.actorId)
    const sequence = await this.infra.publishSnapshot(updated, event.tallies, input.actorId, false)
    await recordPublishedSequence(this.db, input.companyId, input.messageId, Number(updated.revision), sequence)
    return event
  }

  async close(input: ClosePollCommand): Promise<PollUpdatedEvent | null> {
    const updated = await this.infra.transaction(async (db) => {
      const row = await lockPoll(db, input.companyId, input.messageId)
      if (!row) throw new PollApplicationError('not_found', 'poll not found')
      if (row.poll.closedAt) return null
      if (input.reason === 'manual' && input.actorId !== row.author_id) {
        throw new PollApplicationError('forbidden', 'only the poll author can close this poll')
      }
      const poll: PollPayload = {
        ...row.poll,
        closedAt: new Date().toISOString(),
        closedReason: input.reason,
      }
      const next = await bumpPollRevision(db, input.companyId, input.messageId, poll)
      if (!next) throw new PollApplicationError('internal', 'poll vanished mid-update')
      return next
    })
    if (!updated) return null
    const event = await this.updatedEvent(input.companyId, input.messageId, input.actorId)
    const sequence = await this.infra.publishSnapshot(updated, event.tallies, input.actorId, false)
    await recordPublishedSequence(this.db, input.companyId, input.messageId, Number(updated.revision), sequence)
    return event
  }

  async show(companyId: string, messageId: string): Promise<PollSnapshot> {
    const row = await findPoll(this.db, companyId, messageId)
    if (!row) throw new PollApplicationError('not_found', 'poll not found')
    const { request_fingerprint: _fingerprint, published_revision: _published, ...poll } = row
    return { ...poll, tallies: await pollTallies(this.db, companyId, messageId) }
  }

  async sweepExpired(): Promise<number> {
    const rows = await expiredPolls(this.db, 200)
    let closed = 0
    for (const row of rows) {
      try {
        if (await this.close({
          messageId: row.poll_client_msg_no,
          companyId: row.company_id,
          actorId: null,
          reason: 'expired',
        })) closed++
      } catch (error) {
        console.warn(`[polls] failed to expire ${row.poll_client_msg_no}`, error)
      }
    }
    return closed
  }

  async reconcilePendingPublications(): Promise<number> {
    const rows = await pendingPollPublications(this.db, 200)
    let published = 0
    for (const row of rows) {
      try {
        const sequence = await this.publish(row, null)
        if (await recordPublishedSequence(
          this.db,
          row.company_id,
          row.poll_client_msg_no,
          Number(row.revision),
          sequence,
        )) published++
      } catch (error) {
        console.warn(`[polls] failed to reconcile ${row.poll_client_msg_no}`, error)
      }
    }
    return published
  }

  private async publish(row: PollRow, actorId: string | null): Promise<number> {
    return this.infra.publishSnapshot(
      row,
      await pollTallies(this.db, row.company_id, row.poll_client_msg_no),
      actorId,
      Number(row.revision) === 1,
    )
  }

  private async updatedEvent(companyId: string, messageId: string, actorId: string | null): Promise<PollUpdatedEvent> {
    const row = await findPoll(this.db, companyId, messageId)
    if (!row) throw new PollApplicationError('internal', 'poll vanished mid-update')
    return {
      type: 'poll.updated',
      conversationId: row.channel_id,
      companyId: row.company_id,
      messageId,
      revision: Number(row.revision),
      poll: row.poll,
      tallies: await pollTallies(this.db, companyId, messageId),
      actorId,
    }
  }
}
