import {
  listAgentConversationMutes,
  setAgentConversationMuted,
} from '../../modules/conversations/public.js'
import { resolveAs } from '../cli-identity.js'
import type { ParsedArgs } from '../cli-parse.js'
import type { CliResult } from '../cli-result.js'

interface ConversationDeliveryCommandDependencies {
  ok(text: string): CliResult
  err(text: string, code?: number): CliResult
}

export function createConversationDeliveryCommands(
  dependencies: ConversationDeliveryCommandDependencies,
) {
  const { ok, err } = dependencies

  async function cmdMute(parsed: ParsedArgs): Promise<CliResult> {
    const agentId = resolveAs(parsed)
    try {
      if (parsed.positional[0] === 'list') {
        const rows = await listAgentConversationMutes(agentId)
        if (parsed.flags.json) {
          return ok(JSON.stringify(rows.map((row) => ({
            id: row.id,
            title: row.title,
            muted_until: row.mutedUntil,
          })), null, 2))
        }
        if (rows.length === 0) return ok('(no muted groups)')
        return ok(rows.map((row) => (
          `• ${row.id}  "${row.title}"  — ${row.mutedUntil
            ? `until ${new Date(row.mutedUntil).toISOString()}`
            : 'until you follow it'}`
        )).join('\n'))
      }
      const conversationId = parsed.positional[0]
      if (!conversationId) {
        return err('usage: mute <conversation_id> [--for 30m|2h|1d|1w] [--until <iso>]  OR  mute list')
      }
      const until = parseMuteUntil(parsed)
      const result = await setAgentConversationMuted(agentId, conversationId, true, until)
      const expiry = until ? ` until ${until.toISOString()}` : ' until you follow it again'
      return ok(
        `Muted ${conversationId} ("${result.title}")${expiry}. `
        + `New group messages will not wake you or enter your inbox. A direct @${agentId} mention or a reply quoting your message still gets through. `
        + `Resume with: lingxiloop follow ${conversationId}`,
      )
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error))
    }
  }

  async function cmdFollow(parsed: ParsedArgs): Promise<CliResult> {
    const agentId = resolveAs(parsed)
    const conversationId = parsed.positional[0]
    if (!conversationId) return err('usage: follow <conversation_id>')
    try {
      const result = await setAgentConversationMuted(agentId, conversationId, false, null)
      return ok(result.changed
        ? `Following ${conversationId} again. New messages will resume normal inbox delivery.`
        : `${conversationId} was not muted; normal delivery is already active.`)
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error))
    }
  }

  return { cmdFollow, cmdMute }
}

function parseMuteUntil(parsed: ParsedArgs): Date | null {
  const untilRaw = typeof parsed.flags.until === 'string' ? parsed.flags.until : ''
  const forRaw = typeof parsed.flags.for === 'string' ? parsed.flags.for : ''
  if (untilRaw && forRaw) throw new Error('use either --until or --for, not both')
  if (untilRaw) {
    const until = new Date(untilRaw)
    if (Number.isNaN(until.getTime())) throw new Error('invalid --until timestamp')
    if (until.getTime() <= Date.now()) throw new Error('--until must be in the future')
    return until
  }
  if (!forRaw) return null
  const match = /^(\d+)(m|h|d|w)$/i.exec(forRaw.trim())
  if (!match) throw new Error('invalid --for duration (use e.g. 30m, 2h, 1d, or 1w)')
  const amount = Number(match[1])
  const unitMs = {
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
  }[match[2].toLowerCase() as 'm' | 'h' | 'd' | 'w']
  if (amount < 1 || amount * unitMs > 90 * 86_400_000) {
    throw new Error('--for duration must be between 1 minute and 90 days')
  }
  return new Date(Date.now() + amount * unitMs)
}
