import assert from 'node:assert/strict'
import test from 'node:test'
import type { EmailRetryCandidate } from '../modules/email/contracts.js'
import { EmailRetryApplication, nextEmailRetryAt } from '../modules/email/retry-application.js'
import type { SendArgs } from '../modules/email/provider.js'

const candidate: EmailRetryCandidate = {
  messageId: 'message-1',
  conversationId: 'conversation-1',
  companyId: 'company-1',
  smtpMessageId: 'smtp-1@example.test',
  inReplyTo: null,
  references: [],
  subject: 'Subject',
  fromAddress: 'Agent <agent@example.test>',
  toAddresses: ['person@example.test'],
  ccAddresses: [],
  body: 'Body',
  autoSubmitted: false,
  retryAttempts: 0,
}

test('retry sends through one stable tenant idempotency key and marks the tenant row sent', async () => {
  const sent: SendArgs[] = []
  const marked: Array<{ companyId: string; messageId: string }> = []
  const application = new EmailRetryApplication({
    claim: async () => [candidate],
    findAttachments: async () => [{
      filename: 'brief.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 4,
      storageKey: 'email-attachments/brief.pdf',
      truncated: false,
    }],
    resolveAttachment: async (key) => `https://storage.example/${key}`,
    normalizeFromAddress: (value) => value,
    normalizeMessageId: (value) => value,
    send: async (args) => {
      sent.push(args)
      return { ok: true, smtpMessageId: 'smtp-1@example.test', error: null }
    },
    markSent: async (input) => { marked.push(input) },
    markFailed: async () => { assert.fail('successful retry must not be marked failed') },
    metric: () => undefined,
    terminalAlert: async () => undefined,
    unexpected: () => assert.fail('successful retry must not report an unexpected failure'),
    now: () => 1_700_000_000_000,
  })

  assert.deepEqual(await application.run(), { attempted: 1 })
  assert.equal(sent[0]?.idempotencyKey, 'email-retry/company-1/message-1')
  assert.equal(sent[0]?.attachments?.[0]?.path, 'https://storage.example/email-attachments/brief.pdf')
  assert.equal(marked[0]?.companyId, 'company-1')
  assert.equal(marked[0]?.messageId, 'message-1')
})

test('attachment URL failure is explicit and never sends a degraded email', async () => {
  let sent = false
  let unexpected: unknown
  const application = new EmailRetryApplication({
    claim: async () => [candidate],
    findAttachments: async () => [{
      filename: 'brief.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 4,
      storageKey: 'email-attachments/brief.pdf',
      truncated: false,
    }],
    resolveAttachment: async () => { throw new Error('R2 unavailable') },
    normalizeFromAddress: (value) => value,
    normalizeMessageId: (value) => value,
    send: async () => {
      sent = true
      return { ok: true, smtpMessageId: null, error: null }
    },
    markSent: async () => assert.fail('storage failure must not mark sent'),
    markFailed: async () => assert.fail('unexpected infrastructure failure retains its claim lease'),
    metric: () => undefined,
    terminalAlert: async () => undefined,
    unexpected: (_candidate, error) => { unexpected = error },
    now: Date.now,
  })

  assert.deepEqual(await application.run(), { attempted: 1 })
  assert.equal(sent, false)
  assert.match(String(unexpected), /R2 unavailable/)
})

test('the final failed attempt becomes terminal and emits one alert', async () => {
  let nextRetry: Date | null | undefined
  let alerts = 0
  const application = new EmailRetryApplication({
    claim: async () => [{ ...candidate, retryAttempts: 5 }],
    findAttachments: async () => [],
    resolveAttachment: async () => assert.fail('no attachment should resolve'),
    normalizeFromAddress: (value) => value,
    normalizeMessageId: (value) => value,
    send: async () => ({ ok: false, smtpMessageId: null, error: 'provider unavailable' }),
    markSent: async () => assert.fail('failed retry must not mark sent'),
    markFailed: async (input) => { nextRetry = input.nextRetryAt },
    metric: () => undefined,
    terminalAlert: async () => { alerts += 1 },
    unexpected: () => assert.fail('expected provider failure is not unexpected'),
    now: () => 1_700_000_000_000,
  })

  await application.run()
  assert.equal(nextRetry, null)
  assert.equal(alerts, 1)
  assert.equal(nextEmailRetryAt(6, 1_700_000_000_000), null)
})
