export interface CliSideEffect {
  event: string
  command?: string
  visibleToUser?: boolean
  conversationId?: string
  messageId?: string
  authorId?: string
  companyId?: string
  [key: string]: unknown
}

export interface CliResult {
  ok: boolean
  text: string
  exitCode: number
  sideEffects?: CliSideEffect[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeCliSideEffects(value: unknown): CliSideEffect[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is CliSideEffect => (
    isRecord(item) && typeof item.event === 'string' && item.event.length > 0
  ))
}

export function cliResultHasReplySideEffect(result: unknown): boolean {
  if (!isRecord(result)) return false
  return normalizeCliSideEffects(result.sideEffects).some((effect) => (
    effect.event === 'message.posted'
    && effect.command === 'reply'
    && effect.visibleToUser !== false
  ))
}

export function cliResultSideEffects(result: unknown): CliSideEffect[] {
  if (!isRecord(result)) return []
  return normalizeCliSideEffects(result.sideEffects)
}

export async function writeCliSideEffectsToResultPath(result: CliResult): Promise<void> {
  const path = process.env.LINGXILOOP_CLI_RESULT_PATH
  const sideEffects = normalizeCliSideEffects(result.sideEffects)
  if (!path || sideEffects.length === 0) return
  const { appendFile } = await import('node:fs/promises')
  await appendFile(path, JSON.stringify({ sideEffects }) + '\n', 'utf8')
}
