/**
 * `/runtime/cli` argv normalization.
 *
 * The pod's `lingxiloop` shim posts a raw argv array to this endpoint. We
 * MUST strip any `--as <id>` / `--as=<id>` the client supplied before
 * delegating to `runCli` — the JWT pins the agent identity and re-
 * injects `--as <jwt.sub>` at the front. Without the strip, a
 * compromised pod could append `--as someone-else` to argv and the
 * second `--as` (parseArgs takes the LAST occurrence) would win.
 *
 * Lifted into its own module so cli-argv.test.ts can exercise it
 * without booting the full Express + DB stack.
 */

/** Remove every occurrence of `--as <id>` and `--as=<id>` from argv.
 *  Returns a new array; the input is not mutated. The supplied tokens
 *  are kept in their original order otherwise — argv-positional order
 *  matters for `lingxiloop` subcommand parsing. */
export function stripAsArgs(argv: readonly string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]
    if (tok === '--as') {
      // Skip both `--as` and the value that follows. If the next token
      // is missing (malformed argv) we still drop the `--as`.
      i++
      continue
    }
    if (tok.startsWith('--as=')) continue
    out.push(tok)
  }
  return out
}

/** Build the final argv passed to runCli: `--as <sub>` at the front,
 *  with every client-supplied `--as` flag stripped from the tail. The
 *  prepended `--as` resolves first in parseArgs's left-to-right scan,
 *  so any *other* `--as` that somehow snuck through would still be
 *  superseded by this one — but we strip them anyway as defence in
 *  depth. */
export function buildRuntimeArgv(jwtSub: string, clientArgv: readonly string[]): string[] {
  return ['--as', jwtSub, ...stripAsArgs(clientArgv)]
}
