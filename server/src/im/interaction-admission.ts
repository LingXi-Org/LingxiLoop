import type { Queryable } from '../db/queryable.js'
import { pool } from '../db/pool.js'
import { HttpError } from '../http/errors.js'
import type { NativeMessage } from './message-types.js'
import { messageAcceptanceDigest } from './messages-digest.js'
import { assertVisualizeActor, type VisualizeActor } from './visualize.js'

/** Generic sends and signed callbacks can replay a durable admission, never mint it. */
export async function assertInteractionAdmission(input: VisualizeActor & { clientNonce: string; payload: NativeMessage }, db: Queryable = pool): Promise<void> {
  if (input.payload.metadata.custom.uiInteraction !== undefined) throw new HttpError(410, 'The retired interactive UI protocol is unavailable.')
  if (input.payload.metadata.custom.questionnaireReply !== undefined) await (await import('./questionnaires.js')).assertQuestionnaireAdmission(input, db)
  if (input.payload.metadata.custom.visualizeFollowUp === undefined) return
  if (input.payload.role !== 'user' || input.payload.id !== input.clientNonce) throw new HttpError(403, 'Invalid Visualize follow-up.')
  await assertVisualizeActor(db, input, 'conversation:write')
  const receipt = (await db.query<{input_digest: string; channel_type: number; payload: NativeMessage}>(`SELECT input_digest,channel_type,payload FROM im_send_acceptances
    WHERE company_id=$1 AND user_id=$2 AND channel_id=$3 AND client_nonce=$4`, [input.companyId, input.userId, input.channelId, input.clientNonce])).rows[0]
  if (!receipt || receipt.payload.metadata.custom.visualizeFollowUp === undefined || receipt.input_digest !== messageAcceptanceDigest({ channelId: input.channelId, channelType: receipt.channel_type, payload: input.payload })) throw new HttpError(403, 'Submit follow-ups from an authorized Visualize page.')
}
