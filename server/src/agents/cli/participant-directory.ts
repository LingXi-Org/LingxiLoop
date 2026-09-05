import {
  getAgentCliIdentity,
  listAgentCliParticipants,
  listAgentCliStatuses,
} from '../../modules/agents/index.js'
import { resolveAs } from '../cli-identity.js'
import type { ParsedArgs } from '../cli-parse.js'
import type { CliResult } from '../cli-result.js'

interface ParticipantDirectoryCommandDependencies {
  ok(text: string): CliResult
  err(text: string, code?: number): CliResult
}

export function createParticipantDirectoryCommands(
  dependencies: ParticipantDirectoryCommandDependencies,
) {
  const { ok, err } = dependencies

  async function cmdWhoami(parsed: ParsedArgs): Promise<CliResult> {
    const id = resolveAs(parsed)
    try {
      const result = await getAgentCliIdentity(id)
      if (parsed.flags.json) return ok(JSON.stringify(result.identity, null, 2))
      const participant = result.identity
      const lines = [
        `id:        ${participant.id}`,
        `name:      ${participant.name}`,
        `kind:      ${participant.kind}`,
        participant.role ? `role:      ${participant.role}` : '',
        `status:    ${participant.status}`,
        participant.bio ? `bio:       ${participant.bio}` : '',
        participant.tools?.length ? `tools:     ${participant.tools.join(', ')}` : '',
        '',
        `member of ${result.conversations.length} conversation(s):`,
        ...result.conversations.map((conversation) => (
          `  · [${conversation.kind.padEnd(7)}] ${conversation.id.padEnd(28)} ${conversation.title}`
        )),
      ].filter(Boolean)
      return ok(lines.join('\n'))
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error))
    }
  }

  async function cmdParticipants(parsed: ParsedArgs): Promise<CliResult> {
    const actorId = resolveAs(parsed)
    const kind = parsed.flags.kind ? String(parsed.flags.kind) : null
    try {
      const rows = await listAgentCliParticipants(actorId, kind)
      if (parsed.flags.json) return ok(JSON.stringify(rows, null, 2))
      return ok([
        'id              kind   status      role',
        '-----------------------------------------------------',
        ...rows.map((row) => (
          `${row.id.padEnd(15)} ${row.kind.padEnd(6)} ${row.status.padEnd(11)} ${row.role ?? ''}`
        )),
      ].join('\n'))
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error))
    }
  }

  async function cmdStatus(parsed: ParsedArgs): Promise<CliResult> {
    const actorId = resolveAs(parsed)
    try {
      const rows = await listAgentCliStatuses(actorId)
      if (parsed.flags.json) return ok(JSON.stringify(rows, null, 2))
      return ok([
        'agent              status',
        '-----------------------------',
        ...rows.map((row) => `${row.name.padEnd(8)} (${row.id.padEnd(6)})  ${row.status}`),
      ].join('\n'))
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error))
    }
  }

  return { cmdParticipants, cmdStatus, cmdWhoami }
}
