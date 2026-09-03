import { describe, expect, it } from 'vitest'
import { sendSmtpEmail } from './smtp'

const encoder = new TextEncoder()

describe('Alibaba Mail SMTP', () => {
  it('authenticates over TLS and sends an HTML message', async () => {
    const replies = [
      '220 ready',
      '250-smtp.qiye.aliyun.com\r\n250 AUTH LOGIN',
      '334 username',
      '334 password',
      '235 authenticated',
      '250 sender ok',
      '250 recipient ok',
      '354 continue',
      '250 queued',
      '221 bye',
    ].join('\r\n') + '\r\n'
    const writes: string[] = []
    let closed = false
    const socket = {
      readable: new ReadableStream({ start: (controller) => controller.enqueue(encoder.encode(replies)) }),
      writable: new WritableStream({ write: (chunk) => { writes.push(new TextDecoder().decode(chunk)) } }),
      opened: Promise.resolve({}),
      closed: Promise.resolve(),
      upgraded: false,
      secureTransport: 'on' as const,
      close: async () => { closed = true },
      startTls: () => { throw new Error('unexpected STARTTLS') },
    } satisfies Socket

    await sendSmtpEmail(
      { address: 'no-reply@lingxilearn.cn', password: 'secret' },
      { to: 'student@example.com', subject: 'Verify', html: '<p>123456</p>' },
      (address, options) => {
        expect({ address, options }).toEqual({
          address: { hostname: 'smtp.qiye.aliyun.com', port: 465 },
          options: { secureTransport: 'on', allowHalfOpen: false },
        })
        return socket
      },
    )

    expect({ writes, closed }).toEqual({
      writes: [
        'EHLO lingxilearn.cn\r\n',
        'AUTH LOGIN\r\n',
        'bm8tcmVwbHlAbGluZ3hpbGVhcm4uY24=\r\n',
        'c2VjcmV0\r\n',
        'MAIL FROM:<no-reply@lingxilearn.cn>\r\n',
        'RCPT TO:<student@example.com>\r\n',
        'DATA\r\n',
        'From: =?UTF-8?B?TGluZ3hpTG9vcA==?= <no-reply@lingxilearn.cn>\r\nTo: <student@example.com>\r\nSubject: =?UTF-8?B?VmVyaWZ5?=\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\nPHA+MTIzNDU2PC9wPg==\r\n.\r\n',
        'QUIT\r\n',
      ],
      closed: true,
    })
  })
})
