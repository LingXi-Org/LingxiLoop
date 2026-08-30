import { createHmac, timingSafeEqual } from 'node:crypto'
import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { env } from '../../env.js'
import { auditInTransaction } from '../identity/public.js'
import { TrustApplication } from './application.js'

const signingKey = createHmac('sha256', env.WUKONG_USER_TOKEN_SECRET)
  .update('lingxiloop:trust-snapshot-signing:v1')
  .digest()

function signature(canonicalPayload: string): string {
  return createHmac('sha256', signingKey).update(canonicalPayload).digest('hex')
}

export const trustApplication = new TrustApplication({
  transaction: (work) => withTransaction(pool, work),
  sign: signature,
  verify: (canonicalPayload, candidate) => {
    if (!/^[0-9a-f]{64}$/.test(candidate)) return false
    return timingSafeEqual(Buffer.from(signature(canonicalPayload), 'hex'), Buffer.from(candidate, 'hex'))
  },
  now: () => new Date(),
  auditInTransaction,
})
