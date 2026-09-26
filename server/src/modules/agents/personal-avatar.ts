import type { Queryable } from '../../db/queryable.js'
import { HttpError } from '../../http/errors.js'
import type { AvatarInput } from '../identity/contracts.js'
import { prepareAvatar } from '../identity/profile-avatar.js'
import type { ParticipantScope } from './contracts.js'
import { listParticipants } from './repository.js'

export type PersonalAgentAvatar = { seed: string } | { url: string }
export const agentAvatarKey = (companyId: string, agentId: string) => JSON.stringify([companyId, agentId])

export async function savePersonalAgentAvatar(db: Queryable, scope: ParticipantScope, agentId: string, input: AvatarInput | null) {
  const visible = await listParticipants(db, scope)
  if (!visible.some(agent => agent.id === agentId && agent.kind === 'agent' && !agent.departedAt)) {
    throw new HttpError(404, '智能体不存在或不可访问')
  }
  const avatar: PersonalAgentAvatar | null = input === null ? null : 'seed' in input
    ? { seed: input.seed }
    : { url: (await prepareAvatar(db, scope, input, 'user')).avatarUrl }
  const key = agentAvatarKey(scope.companyId, agentId)
  await db.query(`INSERT INTO user_preferences (user_id,prefs,updated_at)
    VALUES ($1,jsonb_build_object('agentAvatars', $2::jsonb),NOW())
    ON CONFLICT(user_id) DO UPDATE SET prefs=jsonb_set(user_preferences.prefs,'{agentAvatars}',
      (COALESCE(user_preferences.prefs->'agentAvatars','{}'::jsonb) - $3::text) || $2::jsonb),updated_at=NOW()`,
  [scope.userId, JSON.stringify(avatar ? { [key]: avatar } : {}), key])
  return { avatar }
}
