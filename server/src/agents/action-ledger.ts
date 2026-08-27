/**
 * Postgres-backed ledger for communication-action idempotency (issue #7).
 *
 * Read the header comment on `agent_action_executions` in
 * `server/src/db/schema.sql` first: this ledger gives replay detection +
 * observability, but is NOT by itself the exactly-once guarantee — a
 * process crash between "claimed" and "marked succeeded" leaves a
 * `pending` row that a retry is allowed to reclaim and re-execute. The
 * actual at-most-once guarantee for `message.send` / `reaction.toggle` /
 * `handoff.create` lives at the sink (message/handoff unique indexes and the
 * atomic claim+mutate transaction in `tReact()`) — this ledger just avoids
 * re-invoking the executor when we already know another action succeeded.
 */

import { pool } from '../db/pool.js'
import type { CliResult } from './cli-result.js'

export type ActionLedgerClaim =
  | { claimed: true }
  | { claimed: false; status: 'succeeded'; result: CliResult }

export interface ActionLedgerPort {
  /** Atomically claim (or reclaim) an idempotency key before executing
   *  the real action. Returns `claimed: false` with the stored result
   *  only when the key already succeeded — callers must skip the real
   *  executor in that case. A `pending` or `failed` prior row is
   *  reclaimed (returns `claimed: true`) so the caller retries. */
  claim(args: {
    key: string
    agentId: string
    inputScopeKey: string
    actionIndex: number
    actionType: string
    actionHash: string
  }): Promise<ActionLedgerClaim>
  markSucceeded(key: string, result: CliResult): Promise<void>
  markFailed(key: string, error: string): Promise<void>
}

interface LedgerRow {
  status: 'pending' | 'succeeded' | 'failed'
  result_json: CliResult | null
}

export const pgActionLedger: ActionLedgerPort = {
  async claim(args): Promise<ActionLedgerClaim> {
    const { rows } = await pool.query<LedgerRow>(
      `INSERT INTO agent_action_executions
         (idempotency_key, agent_id, input_scope_key, action_index, action_type, action_hash, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       ON CONFLICT (idempotency_key) DO UPDATE SET
         status = CASE WHEN agent_action_executions.status = 'succeeded'
                        THEN agent_action_executions.status ELSE 'pending' END,
         updated_at = CASE WHEN agent_action_executions.status = 'succeeded'
                            THEN agent_action_executions.updated_at ELSE NOW() END
       RETURNING status, result_json`,
      [args.key, args.agentId, args.inputScopeKey, args.actionIndex, args.actionType, args.actionHash],
    )
    const row = rows[0]
    if (row && row.status === 'succeeded') {
      return { claimed: false, status: 'succeeded', result: row.result_json ?? { ok: true, text: '(replayed)', exitCode: 0 } }
    }
    return { claimed: true }
  },

  async markSucceeded(key, result): Promise<void> {
    await pool.query(
      `UPDATE agent_action_executions
          SET status = 'succeeded', result_json = $2::jsonb, error = NULL, updated_at = NOW()
        WHERE idempotency_key = $1`,
      [key, JSON.stringify(result)],
    )
  },

  async markFailed(key, error): Promise<void> {
    // Guard against downgrading an already-succeeded row: a caller can
    // race a timeout against a slow-but-ultimately-successful execution
    // (the CLI call keeps running server-side after the caller's own
    // Promise.race timed out and called markFailed) — if that execution
    // then commits 'succeeded' a moment later, this must not overwrite it
    // back to 'failed'.
    await pool.query(
      `UPDATE agent_action_executions
          SET status = 'failed', error = $2, updated_at = NOW()
        WHERE idempotency_key = $1 AND status <> 'succeeded'`,
      [key, error],
    )
  },
}
