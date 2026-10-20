import { createHash } from 'node:crypto'
import { z } from 'zod'

const ids = z.array(z.string().min(1).max(2000)).max(50)
export const runHistoryQuerySchema = z.object({
  sourceClientMsgNos: ids, runIds: ids, cursor: z.string().min(1).max(6000).optional(),
}).strict().refine(value => value.sourceClientMsgNos.length + value.runIds.length > 0
  && value.sourceClientMsgNos.length + value.runIds.length <= 50, 'one bounded IM page is required')

const cursorSchema = z.object({ version: z.literal(1), scope: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/), runId: z.string().min(1).max(2000),
}).strict()
type Position = Pick<z.infer<typeof cursorSchema>, 'createdAt' | 'runId'>

/** A cursor is only a scoped position, never permission to read its run. */
export function runHistoryCursor(scope: { companyId: string; principalId: string; conversationId: string }, query: z.infer<typeof runHistoryQuerySchema>) {
  const sourceClientMsgNos = [...new Set(query.sourceClientMsgNos)].sort(), runIds = [...new Set(query.runIds)].sort()
  const digest = createHash('sha256').update(JSON.stringify([scope.companyId,scope.principalId,scope.conversationId,sourceClientMsgNos,runIds])).digest('hex')
  let position: Position | undefined
  if (query.cursor) {
    try {
      if (!/^[A-Za-z0-9_-]+$/.test(query.cursor)) throw new Error('invalid encoding')
      const decoded = cursorSchema.parse(JSON.parse(Buffer.from(query.cursor,'base64url').toString('utf8')))
      if (decoded.scope !== digest || !Number.isFinite(Date.parse(decoded.createdAt))) throw new Error('wrong cursor scope')
      position = decoded
    } catch { throw Object.assign(new Error('invalid run history cursor'),{ status: 400 }) }
  }
  return { sourceClientMsgNos,runIds,position,
    encode: (next: Position) => Buffer.from(JSON.stringify({ version: 1,scope: digest,...next })).toString('base64url') }
}
