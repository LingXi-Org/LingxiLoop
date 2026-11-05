import type { Queryable } from '../db/queryable.js'
import { pool } from '../db/pool.js'
import { HttpError } from '../http/errors.js'
import type { NativeMessage } from './message-types.js'

/** Retired interactions cannot enter ordinary sends or signed callbacks. */
export async function assertInteractionAdmission(input: { companyId: string; channelId: string; userId: string; clientNonce: string; payload: NativeMessage }, db: Queryable = pool): Promise<void> {
  const custom = input.payload.metadata.custom
  if (custom.uiInteraction !== undefined || custom.visualizeFollowUp !== undefined) throw new HttpError(410, '此交互功能已下线。')
  if (custom.questionnaireReply !== undefined) await (await import('./questionnaires.js')).assertQuestionnaireAdmission(input, db)
}
