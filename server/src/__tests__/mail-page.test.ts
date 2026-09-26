import assert from 'node:assert/strict'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import { EmailApplication, type EmailInfrastructure } from '../modules/email/application.js'
import { emailListQuerySchema } from '../modules/email/contracts.js'

test('mail sending retains project ownership, attachments and genuine provider failure', async () => {
  const conversations: Parameters<EmailInfrastructure['findOrCreateConversation']>[0][] = []
  const deliveries: Parameters<EmailInfrastructure['send']>[0][] = []
  let failed = false
  const infrastructure: EmailInfrastructure = {
    assertAvailable: () => {}, publicUrl: async key => `https://storage.test.invalid/${key}`,
    parseAddress: raw => ({ addr: raw, name: null }), formatAddress: address => address,
    sanitizeSubject: value => value.trim(), sanitizeHtml: value => value,
    ensureAddress: async () => ({ email: 'me@example.com', displayName: 'Me' }),
    mintMessageId: () => 'smtp-id', normalizeMessageId: value => value ?? null,
    splitReplyAddresses: () => ({ to: ['other@example.com'], cc: [] }),
    send: async input => { deliveries.push(input); return { ok: !failed, smtpMessageId: 'smtp-id', error: failed ? 'Provider rejected delivery' : null } },
    completeDelivery: async () => {}, persist: async () => ({ messageId: 'message' }),
    findOrCreateConversation: async input => { conversations.push(input); return { conversationId: 'thread' } },
  }
  const db = { query: async () => ({ rows: [] }) } as unknown as Queryable
  const app = new EmailApplication(db, infrastructure)
  const scope = { companyId: 'company', userId: 'me', projectId: 'course' }
  const input = { idempotencyKey: 'request-1', subject: 'Hello', body: 'Mail content', to: ['other@example.com'], cc: [], attachments: [{ key: 'attachments/company/file', filename: 'file.pdf', mimeType: 'application/pdf', sizeBytes: 10 }] }
  assert.deepEqual(await app.send(scope, input), { messageId: 'message', conversationId: 'thread', transportStatus: 'sent' })
  const { idempotencyKey, ...conversation } = conversations[0]
  assert.deepEqual(conversation, { companyId: 'company', projectId: 'course', inReplyTo: null, references: [], subject: 'Hello', memberIds: ['me'] })
  assert.match(idempotencyKey!, /^email\//)
  assert.deepEqual(deliveries[0].attachments, [{ filename: 'file.pdf', mimeType: 'application/pdf', path: 'https://storage.test.invalid/attachments/company/file' }])
  failed = true
  assert.deepEqual(await app.send(scope, input), { messageId: 'message', conversationId: 'thread', transportStatus: 'failed', error: 'Provider rejected delivery' })
  assert.equal(input.body, 'Mail content')
  await app.send({ companyId: 'company', userId: 'me' }, input)
  assert.equal(conversations[2].projectId, undefined)
})

test('mail reading and replies require thread membership, and list queries are bounded', async () => {
  const db = { query: async () => ({ rows: [{ members: ['owner'], html: '<p>Private</p>' }] }) } as unknown as Queryable
  const app = new EmailApplication(db, { assertAvailable: () => {}, sanitizeHtml: value => value } as EmailInfrastructure)
  await assert.rejects(app.html({ companyId: 'company', userId: 'outsider' }, 'message'), { code: 'thread_forbidden' })
  await assert.rejects(app.previewReply({ companyId: 'company', userId: 'outsider' }, 'message', { cc: [] }), { code: 'thread_forbidden' })
  assert.deepEqual(await app.html({ companyId: 'company', userId: 'owner' }, 'message'), { kind: 'html', html: '<p>Private</p>' })
  assert.deepEqual(emailListQuerySchema.parse({ q: ' Alice ', offset: '50' }), { q: 'Alice', offset: 50 })
  for (const value of [{ offset: '-1' }, { offset: '0.5' }, { q: 'x'.repeat(201) }, { projectId: 'other' }]) {
    assert.equal(emailListQuerySchema.safeParse(value).success, false)
  }
})
