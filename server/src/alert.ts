/**
 * Discord alert webhook (operational signals — NOT the release channel).
 *
 * Fire-and-forget: a single POST. Errors are swallowed so a flaky
 * webhook can't take down the email/retry/inbound code path that
 * triggered the alert.
 *
 * Use sparingly: only for events you'd actually want to know about
 * within minutes — terminal retry failure (real message loss), repeated
 * attachment-upload errors, schema drift. Anything you'd just look at
 * the next morning belongs in the structured logs, not here.
 *
 * Disabled when DISCORD_ALERT_WEBHOOK_URL is empty; alerts then just
 * log to stderr so the dev environment still sees them.
 */
import { env } from './env.js'

interface AlertArgs {
  /** Short title (becomes Discord embed title). */
  title: string
  /** Free-form body — code blocks ok, kept under ~1.5KB for safety. */
  detail: string
  /** Optional severity tag, surfaces as the embed color in Discord. */
  level?: 'warn' | 'error' | 'info'
}

/** Send one alert. Never throws — returns whether the webhook actually
 *  POSTed (false on missing url / network error / non-2xx). */
export async function alertDiscord(args: AlertArgs): Promise<boolean> {
  const url = env.DISCORD_ALERT_WEBHOOK_URL
  if (!url) {
    console.warn(`[alert/disabled] ${args.title}: ${args.detail.slice(0, 200)}`)
    return false
  }
  // Embed colors: red for error, amber for warn, blue for info.
  const color = args.level === 'error' ? 0xC43C32
    : args.level === 'warn' ? 0xE8A33C
    : 0x00A8F0
  const body = {
    embeds: [{
      title: args.title.slice(0, 256),
      description: args.detail.slice(0, 1800),
      color,
      timestamp: new Date().toISOString(),
    }],
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      console.warn(`[alert] webhook ${res.status}: ${args.title}`)
      return false
    }
    return true
  } catch (e) {
    console.warn(`[alert] webhook network error for "${args.title}": ${e instanceof Error ? e.message : String(e)}`)
    return false
  }
}
