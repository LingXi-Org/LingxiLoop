/**
 * Workspace handle for an agent's turn.
 *
 * In the long-running Pod model the workspace IS a FUSE mount of the
 * agent's `agent_workspace` rows (see `lingxiloop-fuse` Go binary). The
 * Pod mounts it at `/workspace` once on boot; reads/writes flow
 * straight to Postgres. There's no per-turn hydrate from DB and no
 * per-turn commit back — the FUSE layer makes the FS and the DB the
 * same thing.
 *
 * This module used to do that sync; what's left is a tiny adapter so
 * the agent loop (`runAgentTurn`) keeps the same shape (`hydrate` →
 * pass `ns` to tools → `commit`/`teardown` no-op).
 *
 * The runId field is kept for trace correlation but doesn't drive
 * directory layout anymore (one workspace per agent, not per run).
 */

/** Empty in the FUSE world — kept for shape compatibility with code
 *  that still iterates the baseline (none, currently). */
export type FsBaseline = Map<string, string>

export interface FsNamespace {
  agentId: string
  runId: string
  /** Mount point of the FUSE-backed workspace. Always `/workspace`
   *  inside the pod; on a dev host running runAgentTurn out-of-pod we
   *  honour LINGXILOOP_PERSONA_DIR for testing. */
  rootDir: string
  /** Always an empty map in FUSE mode — no diff is computed at the
   *  end-of-turn. */
  baseline: FsBaseline
}

export interface CommitDiff {
  inserts: { path: string; body: string }[]
  updates: { path: string; body: string; prevSha: string }[]
  deletes: string[]
}

/** Acquire the per-turn namespace handle. In the Pod this is a
 *  ~10µs no-op — the FS is already mounted and ready. We just hand
 *  back a struct pointing at /workspace. */
export async function hydrate(agentId: string, runId: string): Promise<FsNamespace> {
  const rootDir = process.env.LINGXILOOP_PERSONA_DIR || '/workspace'
  return { agentId, runId, rootDir, baseline: new Map() }
}

/** No-op. The FUSE layer auto-persists writes to Postgres as they
 *  happen; nothing to flush at end-of-turn. Kept for call-site
 *  compatibility. */
export async function commit(_ns: FsNamespace, _opts: { companyId?: string | null } = {}): Promise<CommitDiff> {
  return { inserts: [], updates: [], deletes: [] }
}

/** No-op. The FS is persistent across turns — don't even THINK about
 *  rm-ing the mount point. */
export async function teardown(_ns: FsNamespace): Promise<void> { /* intentionally empty */ }

/** Called once at server boot. Used to wipe stale per-turn temp dirs;
 *  in FUSE world there's nothing to sweep. Kept as a no-op for
 *  index.ts's existing call. */
export async function sweepStaleNamespaces(): Promise<void> { /* intentionally empty */ }

/** Which paths a write-side tool is allowed to touch. Memory + the
 *  persona files are persisted (committed back to the DB through the
 *  FUSE layer), other locations are still safe to use as scratch but
 *  the agent's expected to keep them small. */
export function isPersistedPath(p: string): boolean {
  if (p === 'SOUL.md' || p === 'IDENTITY.md') return true
  if (p.startsWith('memory/')) return true
  if (p.startsWith('skills/')) return true
  return false
}

/** Reject paths with `..`, leading `/`, NUL bytes, Windows reserved
 *  characters, control characters, or empty/multi-slash segments.
 *
 *  Note: does NOT reject SQL LIKE wildcards (`%`, `_`) — those are
 *  common in legitimate filenames (e.g. `my_notes.md`). The fs-
 *  endpoints `/list` and `/stat` queries that bind paths into LIKE
 *  patterns escape them at the SQL site via {@link likeEscape} +
 *  `ESCAPE '\\'`. */
export function isSafePath(p: string): boolean {
  if (!p || p.length === 0 || p.length > 512) return false
  if (p.includes('\0')) return false
  if (p.startsWith('/') || p.startsWith('\\')) return false
  // Control chars (anything below space, plus DEL). Without this an
  // agent could write paths that look identical to a different one
  // when rendered in logs / UIs.
  if (/[\x00-\x1f\x7f]/.test(p)) return false
  const segs = p.split('/')
  for (const s of segs) {
    // Empty segment = leading `/`, trailing `/`, or `//` — already
    // covered above for leading, here for the rest.
    if (s === '') return false
    if (s === '..' || s === '.') return false
    if (/[<>:"|?*]/.test(s)) return false
  }
  return true
}

/** Escape the SQL LIKE wildcards `%` and `_` (and the escape char
 *  `\\` itself) so a user-supplied prefix in a `path LIKE $2 || '%'`
 *  query matches only literal characters. Must be paired with
 *  `ESCAPE '\\'` on the LIKE clause at the call site.
 *
 *  Example:
 *    agent writes `path=foo_bar`
 *    SQL: `... path LIKE $2 || '%' ESCAPE '\\'`  with $2 = likeEscape('foo_bar') + '/'
 *    → matches only `foo_bar/...`, not `fooxbar/...` etc. */
export function likeEscape(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&')
}
