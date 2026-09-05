import assert from 'node:assert/strict'
import test from 'node:test'
import { Webhook } from 'svix'
import type { InboundEmailPayload } from '../modules/email/contracts.js'
import {
  ResendInboundApplication,
  ResendInboundApplicationError,
} from '../modules/email/resend-inbound-application.js'
import {
  retrieveResendInboundEmail,
  verifyResendWebhook,
} from '../modules/email/resend-inbound-infrastructure.js'

const secret = `whsec_${Buffer.alloc(32, 3).toString('base64')}`

function signed(body: Buffer) {
  const id = 'msg_resend_test'
  const timestamp = new Date()
  return {
    id,
    timestamp: String(Math.floor(timestamp.getTime() / 1000)),
    signature: new Webhook(secret).sign(id, timestamp, body),
  }
}

test('Resend webhook verification consumes the unmodified raw body and Svix headers', () => {
  const raw = Buffer.from(JSON.stringify({
    type: 'email.received',
    created_at: '2026-08-29T00:00:00.000Z',
    data: { email_id: '38ee71c7-1312-46db-a299-d8d1c7fe16c0' },
  }))
  assert.equal(verifyResendWebhook(raw, signed(raw), secret).type, 'email.received')
  assert.throws(() => verifyResendWebhook(Buffer.from(`${raw} `), signed(raw), secret))
})

test('Resend inbound application ignores unrelated signed events without provider retrieval', async () => {
  let retrieved = false
  const application = new ResendInboundApplication({
    verify: () => ({ type: 'email.delivered' }),
    retrieve: async () => { retrieved = true; throw new Error('not expected') },
    deliver: async () => ({ kind: 'no_recipient', attemptedRecipients: [] }),
    metric: () => undefined,
  })
  assert.deepEqual(await application.handle(Buffer.from('{}'), signed(Buffer.from('{}'))), {
    kind: 'ignored', eventType: 'email.delivered',
  })
  assert.equal(retrieved, false)
})

test('Resend inbound application classifies invalid signatures without provider calls', async () => {
  const application = new ResendInboundApplication({
    verify: () => { throw new Error('bad signature') },
    retrieve: async () => { throw new Error('not expected') },
    deliver: async () => ({ kind: 'no_recipient', attemptedRecipients: [] }),
    metric: () => undefined,
  })
  await assert.rejects(
    application.handle(Buffer.from('{}'), { id: 'x', timestamp: '1', signature: 'bad' }),
    (error: unknown) => error instanceof ResendInboundApplicationError && error.code === 'invalid_signature',
  )
})

test('Resend Receiving API is normalized into the strict native inbound contract', async () => {
  const calls: string[] = []
  const fetcher: typeof fetch = async (input) => {
    const url = String(input)
    calls.push(url)
    if (url.endsWith('/attachments/attachment-1')) {
      return Response.json({
        id: 'attachment-1', filename: 'note.txt', content_type: 'text/plain', size: 4,
        download_url: 'https://inbound-cdn.resend.com/note.txt',
      })
    }
    if (url === 'https://inbound-cdn.resend.com/note.txt') return new Response('note')
    return Response.json({
      id: '38ee71c7-1312-46db-a299-d8d1c7fe16c0',
      from: 'alice@example.com',
      to: ['agent@loop.example'],
      cc: [],
      subject: 'Hello',
      text: null,
      html: '<p>Hello <strong>agent</strong></p>',
      message_id: '<message-1@example.com>',
      headers: {
        from: 'Alice <alice@example.com>',
        'in-reply-to': '<previous@example.com>',
        references: '<first@example.com> <previous@example.com>',
      },
      attachments: [{ id: 'attachment-1', filename: 'note.txt', content_type: 'text/plain' }],
    })
  }
  const payload: InboundEmailPayload = await retrieveResendInboundEmail(
    '38ee71c7-1312-46db-a299-d8d1c7fe16c0',
    're_test',
    fetcher,
  )
  assert.equal(payload.text, 'Hello agent')
  assert.equal(payload.inReplyTo, '<previous@example.com>')
  assert.deepEqual(payload.references, ['first@example.com', 'previous@example.com'])
  assert.equal(Buffer.from(payload.attachments[0]!.contentBase64, 'base64').toString(), 'note')
  assert.equal(calls.length, 3)
})
