import assert from 'node:assert/strict'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import {
  inboundEmailPayloadSchema,
  type InboundEmailPayload,
  type PersistEmailMessageInput,
} from '../modules/email/contracts.js'
import {
  InboundEmailApplication,
  InboundEmailApplicationError,
  type InboundEmailInfrastructure,
} from '../modules/email/inbound-application.js'
import { verifyInboundEmailSignature } from '../modules/email/inbound-router.js'
import { createHmac } from 'node:crypto'

const payload: InboundEmailPayload = {
  messageId: 'inbound-1@example.com',
  inReplyTo: null,
  references: [],
  from: 'Alice <alice@example.com>',
  to: ['agent@loop.example'],
  cc: [],
  subject: 'Hello',
  text: 'A strict native payload',
  html: null,
  rawSizeBytes: 100,
  autoSubmitted: null,
  attachments: [],
}

function recipientDb(duplicates: Array<{ company_id: string; message_id: string }> = []): Queryable {
  return {
    async query(sql: string) {
      if (sql.includes('LOWER(participant.email) AS address')) return { rows: [{
        address: 'agent@loop.example', company_id: 'company-1', participant_id: 'agent-1',
        participant_name: 'Agent', participant_kind: 'agent',
      }] }
      if (sql.includes('FROM email_messages')) return { rows: duplicates }
      if (sql.includes('FROM participants')) return { rows: [] }
      if (sql.includes('FROM users app_user')) return { rows: [] }
      if (sql.includes('INSERT INTO email_contacts')) return { rows: [], rowCount: 1 }
      throw new Error(`unexpected query: ${sql}`)
    },
  } as unknown as Queryable
}

function infrastructure(overrides: Partial<InboundEmailInfrastructure> = {}) {
  const persisted: PersistEmailMessageInput[] = []
  const base: InboundEmailInfrastructure = {
    storage: { put: async () => 'https://storage.invalid/object' },
    findOrCreateConversation: async () => ({ conversationId: 'conversation-1', created: true }),
    persistMessage: async (input) => {
      persisted.push(input)
      return { messageId: 'message-1', sequence: 1 }
    },
    metric: () => undefined,
    alert: async () => undefined,
    ...overrides,
  }
  return { value: base, persisted }
}

test('inbound delivery uses exact tenant-scoped idempotency keys', async () => {
  const infra = infrastructure()
  const result = await new InboundEmailApplication(recipientDb(), infra.value).deliver(payload)

  assert.equal(result.kind, 'delivered')
  assert.equal(infra.persisted.length, 1)
  assert.equal(infra.persisted[0].companyId, 'company-1')
  assert.equal(infra.persisted[0].idempotencyKey, 'email/inbound/company-1/inbound-1@example.com')
})

test('inbound duplicate exits before storage or persistence', async () => {
  let storageCalls = 0
  const infra = infrastructure({ storage: { put: async () => { storageCalls += 1; return '' } } })
  const result = await new InboundEmailApplication(
    recipientDb([{ company_id: 'company-1', message_id: 'existing-1' }]),
    infra.value,
  ).deliver({
    ...payload,
    attachments: [{
      filename: 'note.txt', mimeType: 'text/plain', sizeBytes: 4,
      contentBase64: Buffer.from('note').toString('base64'), truncated: false,
    }],
  })

  assert.deepEqual(result, { kind: 'deduplicated', messageId: 'existing-1', companyIds: ['company-1'] })
  assert.equal(storageCalls, 0)
  assert.equal(infra.persisted.length, 0)
})

test('attachment storage failures are explicit and never degrade to truncated success', async () => {
  const infra = infrastructure({ storage: { put: async () => { throw new Error('R2 unavailable') } } })
  await assert.rejects(
    new InboundEmailApplication(recipientDb(), infra.value).deliver({
      ...payload,
      attachments: [{
        filename: 'note.txt', mimeType: 'text/plain', sizeBytes: 4,
        contentBase64: Buffer.from('note').toString('base64'), truncated: false,
      }],
    }),
    (error: unknown) => error instanceof InboundEmailApplicationError
      && error.code === 'storage_unavailable',
  )
  assert.equal(infra.persisted.length, 0)
})

test('attachment bytes must match signed payload metadata', async () => {
  const infra = infrastructure()
  await assert.rejects(
    new InboundEmailApplication(recipientDb(), infra.value).deliver({
      ...payload,
      attachments: [{
        filename: 'note.txt', mimeType: 'text/plain', sizeBytes: 99,
        contentBase64: Buffer.from('note').toString('base64'), truncated: false,
      }],
    }),
    /attachment size mismatch/,
  )
  assert.equal(infra.persisted.length, 0)
})

test('inbound HMAC verification requires one canonical 256-bit hex signature', () => {
  const raw = Buffer.from('{"ok":true}')
  const secret = 'secret'
  const signature = createHmac('sha256', secret).update(raw).digest('hex')
  assert.equal(verifyInboundEmailSignature(raw, `sha256=${signature}`, secret), true)
  assert.equal(verifyInboundEmailSignature(raw, signature.slice(0, -1), secret), false)
  assert.equal(verifyInboundEmailSignature(raw, `${signature.slice(0, -1)}z`, secret), false)
  assert.equal(verifyInboundEmailSignature(raw, signature, 'wrong'), false)
})

test('inbound contract rejects partial payloads instead of filling production defaults', () => {
  assert.equal(inboundEmailPayloadSchema.safeParse({
    messageId: payload.messageId,
    from: payload.from,
    to: payload.to,
    text: payload.text,
  }).success, false)
  assert.equal(inboundEmailPayloadSchema.safeParse(payload).success, true)
})
