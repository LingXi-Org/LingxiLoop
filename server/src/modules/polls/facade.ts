import { createNativeMessage } from '../../im/message-types.js'
import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { wukongClient } from '../../im/wukong.js'
import type { WorkerTaskHandle } from '../../runtime/lifecycle.js'
import { PollApplication } from './application.js'

export const pollApplication = new PollApplication(pool, {
  transaction: (work) => withTransaction(pool, work),
  async publishSnapshot(row, tallies, actorId, initial) {
    const revision = Number(row.revision)
    const clientMsgNo = initial
      ? row.poll_client_msg_no
      : `${row.poll_client_msg_no}:revision:${revision}`
    const sent = await wukongClient().sendMessage(
      row.channel_id,
      row.channel_type,
      actorId ?? row.author_id,
      createNativeMessage({ id: row.poll_client_msg_no, role: 'assistant',
        content: [{ type: 'data', name: 'poll', data: { poll: row.poll, pollTallies: tallies, revision } }],
        custom: { refs: { pollClientMsgNo: row.poll_client_msg_no }, suppressAgentWake: !initial } }),
      clientMsgNo,
    )
    return sent.messageSeq
  },
})

let sweepTimer: NodeJS.Timeout | null = null

export function startPollExpirationSweeper(intervalMs: number): WorkerTaskHandle | null {
  if (sweepTimer) return { stop: stopPollExpirationSweeper }
  if (intervalMs <= 0) return null
  const tick = async () => {
    try {
      await pollApplication.reconcilePendingPublications()
      await pollApplication.sweepExpired()
    } catch (error) {
      console.error('[polls] expiration sweep failed', error)
    }
  }
  sweepTimer = setInterval(() => { void tick() }, intervalMs)
  sweepTimer.unref()
  return { stop: stopPollExpirationSweeper }
}

export function stopPollExpirationSweeper(): void {
  if (sweepTimer) clearInterval(sweepTimer)
  sweepTimer = null
}
