/**
 * Optional outbound "you've been invited to <workspace>" email.
 *
 * Fired from POST /companies/:id/invitations when the inviter ticks the
 * Send email checkbox. Provider and configuration failures reject the request.
 *
 * Sender:    Display = "<Inviter> (via LingxiLoop)", address = invites@<EMAIL_DOMAIN>
 * Reply-To:  inviter's own email — replies land in the human's inbox, not a
 *            blackhole. (The invites@ address itself has no inbox.)
 * Auto-Submitted: auto-generated — keeps vacation responders from bounce-
 *                 looping with us.
 *
 */
import { env } from '../../env.js'
import { formatAddress, mintMessageId, sendViaProvider } from '../email/index.js'

export interface InvitationEmailDelivery {
  ok: true
}

export interface InvitationEmailArgs {
  /** Recipient — must be the email locked into the invite. */
  to: string
  /** Display name of the human who created the invite. */
  inviterName: string
  /** Inviter's own email for Reply-To. */
  inviterEmail: string
  companyName: string
  role: 'member' | 'admin'
  /** Optional free-text note the inviter attached. */
  note: string | null
  /** Full https URL the recipient should open (loop.lingxilearn.cn/invite/<token>). */
  inviteUrl: string
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** HTML body — mirrors the welcome-email layout (table-based, inline
 *  styles, system font stack, sky-blue CTA). Same
 *  visual language so a recipient who later gets the waitlist-approved
 *  welcome email recognises the brand. */
function buildInvitationEmailHtml(args: {
  inviterName: string
  companyName: string
  role: 'member' | 'admin'
  note: string | null
  inviteUrl: string
}): string {
  const cdn = env.R2_PUBLIC_BASE
  const logoUrl = cdn ? `${cdn}/email/logo.png` : null
  const fontStack = `'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`
  const inviter = escapeHtml(args.inviterName)
  const company = escapeHtml(args.companyName)
  const roleLabel = args.role === 'admin' ? 'an admin' : 'a member'
  const noteBlock = args.note ? `
                <tr>
                  <td style="padding:0 0 24px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                           style="background:#F1F6FB; border-left:3px solid #00A8F0; border-radius:6px;">
                      <tr>
                        <td style="padding:14px 16px; font-family:${fontStack}; font-size:14px; font-weight:400; line-height:1.5; color:#233A53; font-style:italic;">
                          &ldquo;${escapeHtml(args.note)}&rdquo;
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>` : ''

  const logoRow = logoUrl ? `
        <tr>
          <td align="center" style="padding:36px 0 24px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="vertical-align:middle; padding-right:10px; line-height:0;">
                  <img src="${logoUrl}" alt="" width="32" height="32" style="display:block; width:32px; height:32px;" />
                </td>
                <td style="vertical-align:middle; font-family:${fontStack}; font-size:18px; font-weight:700; color:#0A1B2E; letter-spacing:-0.01em;">
                  LingxiLoop
                </td>
              </tr>
            </table>
          </td>
        </tr>` : `
        <tr>
          <td align="center" style="padding:36px 0 24px; font-family:${fontStack}; font-size:18px; font-weight:700; color:#0A1B2E; letter-spacing:-0.01em;">
            LingxiLoop
          </td>
        </tr>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>You're invited to ${company} on LingxiLoop</title>
</head>
<body style="margin:0; padding:0; background:#FAFCFE; color:#0A1B2E; font-family:${fontStack};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAFCFE;">
    <tr>
      <td align="center" style="padding:24px 16px 48px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; width:100%;">${logoRow}
          <tr>
            <td style="background:#FFFFFF; border-radius:16px; padding:40px 44px 36px; box-shadow:0 1px 0 #E5ECF2;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-family:${fontStack}; font-size:13px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:#5B7186; padding:0 0 8px;">
                    Workspace invitation
                  </td>
                </tr>
                <tr>
                  <td style="font-family:${fontStack}; font-size:28px; font-weight:800; line-height:1.2; color:#0A1B2E; letter-spacing:-0.02em; padding:0 0 14px;">
                    ${inviter} invited you to <span style="color:#00A8F0;">${company}</span>
                  </td>
                </tr>
                <tr>
                  <td style="font-family:${fontStack}; font-size:15px; font-weight:400; line-height:1.6; color:#233A53; padding:0 0 24px;">
                    You&rsquo;ll join as ${roleLabel}. LingxiLoop is a desktop chat where humans and AI teammates share the same rooms &mdash; once you accept, you&rsquo;ll see your new workspace and the agents that live there.
                  </td>
                </tr>${noteBlock}
                <tr>
                  <td style="padding:4px 0 0;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td bgcolor="#00A8F0" style="border-radius:8px; background:#00A8F0; mso-padding-alt:14px 28px;">
                          <a href="${args.inviteUrl}" target="_blank" style="display:inline-block; padding:14px 28px; font-family:${fontStack}; font-size:14px; font-weight:600; line-height:1; color:#FFFFFF; text-decoration:none; letter-spacing:0.01em;">
                            Accept invitation &nbsp;&rarr;
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="font-family:${fontStack}; font-size:12.5px; font-weight:400; line-height:1.55; color:#94A8BC; padding:18px 0 0; word-break:break-all;">
                    Or open this link: <a href="${args.inviteUrl}" style="color:#3E6FA8; text-decoration:none;">${args.inviteUrl}</a>
                  </td>
                </tr>
                <tr>
                  <td style="font-family:${fontStack}; font-size:12.5px; font-weight:400; line-height:1.55; color:#94A8BC; padding:10px 0 0;">
                    LingxiLoop works directly in your browser; no desktop installation is required.
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px 0 0;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr><td style="border-top:1px solid #E5ECF2; line-height:0; font-size:0;">&nbsp;</td></tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="font-family:${fontStack}; font-size:12.5px; font-weight:400; line-height:1.55; color:#5B7186; padding:18px 0 0;">
                    This invitation expires in 7 days. If you weren&rsquo;t expecting it, you can ignore this email &mdash; nothing happens until you click the link.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="font-family:${fontStack}; font-size:12px; font-weight:400; line-height:1.5; color:#94A8BC; padding:24px 0 0;">
              &copy; LingxiLoop &middot; Where teams gather
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export async function sendInvitationEmail(args: InvitationEmailArgs): Promise<InvitationEmailDelivery> {
  if (!env.EMAIL_DOMAIN) {
    throw new Error('EMAIL_DOMAIN is required to send invitations')
  }

  const fromAddr = `invites@${env.EMAIL_DOMAIN}`
  const senderDisplay = `${args.inviterName} (via LingxiLoop)`
  const subject = `${args.inviterName} invited you to ${args.companyName} on LingxiLoop`

  const text = [
    `Hi,`,
    ``,
    `${args.inviterName} invited you to ${args.companyName} on LingxiLoop — you'll join as ${args.role === 'admin' ? 'an admin' : 'a member'}.`,
    ``,
    args.note ? `Note from ${args.inviterName}: "${args.note}"` : null,
    args.note ? `` : null,
    `Accept here: ${args.inviteUrl}`,
    ``,
    `LingxiLoop is a workspace for humans and AI teammates. Once you accept, you'll see your new workspace and its agents.`,
    ``,
    `LingxiLoop works directly in your browser; no desktop installation is required.`,
    ``,
    `This invitation expires in 7 days. If you weren't expecting it, just ignore this email — nothing happens until you click the link.`,
    ``,
    `— LingxiLoop`,
  ].filter((line): line is string => line !== null).join('\n')

  const html = buildInvitationEmailHtml({
    inviterName: args.inviterName,
    companyName: args.companyName,
    role: args.role,
    note: args.note,
    inviteUrl: args.inviteUrl,
  })

  const result = await sendViaProvider({
    from: formatAddress(fromAddr, senderDisplay),
    to: [args.to],
    replyTo: formatAddress(args.inviterEmail, args.inviterName),
    subject,
    text,
    html,
    messageId: mintMessageId(),
    autoSubmitted: 'auto-generated',
  })
  if (!result.ok) throw new Error(result.error ?? 'invitation email send failed')
  return { ok: true }
}
