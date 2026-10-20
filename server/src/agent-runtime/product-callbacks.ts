import { pool } from '../db/pool.js'
import { createCallbackRunner } from './callback-scope.js'

// One process-wide gate, shared by usage, result and terminal outbox callbacks.
// It borrows the existing pool; no separate pool or worker role is introduced.
// Delivery can additionally borrow one runtime connection; leave at least one
// physical slot outside this callback budget even for smaller development pools.
export const runProductCallback = createCallbackRunner(pool, { connectionsPerCallback: 2 })
