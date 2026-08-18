/**
 * Agent identity resolution for the `cumora` CLI. Sits in its own
 * import-side-effect-free module so unit tests can verify the
 * priority order without booting cli.ts's DB / storage / OpenAI graph.
 *
 * See {@link resolveAs} for the resolution order. The production
 * boundary is the pod `/runtime/cli` path: the server strips caller
 * `--as` flags and injects the JWT subject before runCli reaches this
 * function. Local agent bash also gets an ambient identity wrapper so
 * normal `cumora ...` commands run as the current agent, but that is a
 * dev convenience, not a security boundary: without an OS/process
 * sandbox, arbitrary local bash can try to bypass wrapper env.
 */
import type { ParsedArgs } from './cli-parse.js'

/** Resolve which participant identity a CLI invocation acts as.
 *  Resolution order:
 *    1. **Ambient runtime identity** — `CUMORA_AGENT_ID` env, but only
 *       when paired with a trusted runtime source:
 *       - `CUMORA_RUNTIME_CLIENT=http` for the pod JWT path. This is
 *         the production security boundary because the server owns the
 *         token and strips caller-supplied `--as` before runCli.
 *       - `CUMORA_CLI_IDENTITY_SOURCE=agent-bash` for the local
 *         bash-tool wrapper path. This keeps the normal local PATH shim
 *         honest, but it is not a complete boundary against arbitrary
 *         unsandboxed shell commands.
 *       Wins over explicit `--as` whenever present.
 *    2. Explicit `--as <id>` flag — used by the cumora-server's
 *       runtime endpoint (which injects `--as` from a JWT-decoded
 *       agentId before calling runCli) AND by manual dev CLI use
 *       outside any pod.
 *    3. `CUMORA_DEFAULT_AS` env var — dev convenience.
 *
 *  Throws when none is set. The throw is intentional — silently
 *  defaulting to a seed id would re-introduce the impersonation hole
 *  this function exists to close. */
export function resolveAs(parsed: ParsedArgs): string {
  if (process.env.CUMORA_RUNTIME_CLIENT === 'http' || process.env.CUMORA_CLI_IDENTITY_SOURCE === 'agent-bash') {
    const pinned = process.env.CUMORA_AGENT_ID
    if (pinned && pinned.length > 0) return pinned
  }
  const explicit = parsed.flags.as
  if (typeof explicit === 'string' && explicit.length > 0) return explicit
  const fromEnv = process.env.CUMORA_DEFAULT_AS
  if (fromEnv && fromEnv.length > 0) return fromEnv
  throw new Error('--as <participant_id> is required (or set CUMORA_DEFAULT_AS in your env for dev)')
}
