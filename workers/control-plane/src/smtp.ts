import { connect } from 'cloudflare:sockets'

const encoder = new TextEncoder()

type OpenSocket = (address: SocketAddress, options: SocketOptions) => Socket

type SmtpAccount = {
  address: string
  password: string
}

type EmailMessage = {
  to: string
  subject: string
  html: string
}

function base64(value: string): string {
  return btoa(String.fromCharCode(...encoder.encode(value)))
}

function emailSource(account: SmtpAccount, message: EmailMessage): string {
  const body = base64(message.html).match(/.{1,76}/g)?.join('\r\n') ?? ''
  return [
    `From: =?UTF-8?B?${base64('LingxiLoop')}?= <${account.address}>`,
    `To: <${message.to}>`,
    `Subject: =?UTF-8?B?${base64(message.subject)}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    body,
  ].join('\r\n')
}

export async function sendSmtpEmail(account: SmtpAccount, message: EmailMessage, openSocket: OpenSocket = connect): Promise<void> {
  if (![account.address, message.to].every((address) => /^[^\s@]+@[^\s@]+$/.test(address))) throw new Error('invalid email address')
  if (!account.password) throw new Error('SMTP password is required')

  const socket = openSocket({ hostname: 'smtp.qiye.aliyun.com', port: 465 }, { secureTransport: 'on', allowHalfOpen: false })
  const reader = socket.readable.getReader()
  const writer = socket.writable.getWriter()
  const decoder = new TextDecoder()
  let buffer = ''
  let timeout: ReturnType<typeof setTimeout> | undefined

  const readReply = async (expected: number): Promise<void> => {
    let size = 0
    while (true) {
      const lineEnd = buffer.indexOf('\r\n')
      if (lineEnd >= 0) {
        const line = buffer.slice(0, lineEnd)
        buffer = buffer.slice(lineEnd + 2)
        size += line.length
        const match = /^(\d{3}) /.exec(line)
        if (match) {
          if (Number(match[1]) !== expected) throw new Error(`SMTP rejected command (${match[1]})`)
          return
        }
        if (size > 16_384) throw new Error('SMTP reply is too large')
        continue
      }
      const chunk = await reader.read()
      if (chunk.done) throw new Error('SMTP connection closed unexpectedly')
      buffer += decoder.decode(chunk.value, { stream: true })
      if (size + buffer.length > 16_384) throw new Error('SMTP reply is too large')
    }
  }

  const write = (value: string) => writer.write(encoder.encode(`${value}\r\n`))
  const command = async (value: string, expected: number): Promise<void> => {
    await write(value)
    await readReply(expected)
  }

  const transaction = async (): Promise<void> => {
    await socket.opened
    await readReply(220)
    await command('EHLO lingxilearn.cn', 250)
    await command('AUTH LOGIN', 334)
    await command(base64(account.address), 334)
    await command(base64(account.password), 235)
    await command(`MAIL FROM:<${account.address}>`, 250)
    await command(`RCPT TO:<${message.to}>`, 250)
    await command('DATA', 354)
    await command(`${emailSource(account, message)}\r\n.`, 250)
    await write('QUIT')
  }

  try {
    await Promise.race([
      transaction(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('SMTP request timed out')), 15_000)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
    await socket.close().catch(() => undefined)
  }
}
