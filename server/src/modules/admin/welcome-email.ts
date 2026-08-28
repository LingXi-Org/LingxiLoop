import { env } from '../../env.js'
import { formatAddress, mintMessageId, sendViaProvider } from '../../email.js'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function approvedEntryUrl(raw: string): string {
  const url = new URL(raw)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('approved entry URL must use http(s)')
  }
  url.searchParams.set('approved', '1')
  return url.toString()
}

function welcomeHtml(firstName: string, signInUrl: string): string {
  const name = escapeHtml(firstName)
  const url = escapeHtml(signInUrl)
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Welcome to LingxiLoop</title></head>
<body style="margin:0;background:#f8fafc;color:#172033;font-family:Inter,system-ui,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border:1px solid #e5e7eb;border-radius:16px">
      <tr><td style="padding:40px">
        <p style="margin:0 0 24px;font-size:18px;font-weight:700">LingxiLoop</p>
        <h1 style="margin:0 0 16px;font-size:32px;line-height:1.2">You&rsquo;re in.</h1>
        <p style="margin:0 0 16px;line-height:1.6">Welcome to LingxiLoop, ${name}. Your workspace is ready.</p>
        <p style="margin:0 0 28px;line-height:1.6">Sign in with the same LingxiIdentity account you used to join the waitlist.</p>
        <a href="${url}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#16a34a;color:#fff;text-decoration:none;font-weight:600">Open LingxiLoop</a>
        <p style="margin:28px 0 0;color:#64748b;font-size:13px;line-height:1.6">Reply to this email if anything gets in your way.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`
}

export async function sendWaitlistApprovedEmail(input: {
  email: string
  displayName: string
}): Promise<void> {
  if (!env.EMAIL_DOMAIN) throw new Error('EMAIL_DOMAIN is required')
  if (!env.INVITE_BASE_URL) throw new Error('INVITE_BASE_URL is required')
  const signInUrl = approvedEntryUrl(env.INVITE_BASE_URL)
  const firstName = (input.displayName.split(/\s+/)[0] || input.displayName).trim() || 'there'
  const text = [
    `Hi ${firstName},`,
    '',
    `You're in — welcome to LingxiLoop.`,
    '',
    'Your workspace is ready.',
    `Sign in here: ${signInUrl}`,
    'Use the same LingxiIdentity account you used to join the waitlist.',
    '',
    'Reply to this email if anything gets in your way.',
    '',
    '— LingxiLoop',
  ].join('\n')
  const result = await sendViaProvider({
    from: formatAddress(`welcome@${env.EMAIL_DOMAIN}`, 'LingxiLoop'),
    to: [input.email],
    subject: `You're in — welcome to LingxiLoop`,
    text,
    html: welcomeHtml(firstName, signInUrl),
    messageId: mintMessageId(),
    autoSubmitted: 'auto-generated',
  })
  if (!result.ok) throw new Error(`waitlist-approved email failed: ${result.error}`)
}
