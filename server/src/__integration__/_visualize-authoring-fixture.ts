import assert from 'node:assert/strict'
import { skillIndex, type ActionContext } from '@lyyzka/lingxios'
import { visualizeSkill } from '../agent-runtime/visualize-skill.js'

/** Existing direct-callback fixtures test admission/authorization/storage only.
 * Native transaction persistence/rollback is exercised by the real worker test,
 * never established by this explicit hook acknowledgement. */
export function withVisualizeAuthoringFixture(context: ActionContext): ActionContext {
  return { ...context,requestVersion: 1,async activateSkillDelivery(selection) {
    const { name,version,hash } = skillIndex(visualizeSkill)
    assert.deepEqual(selection,{ name,version,hash })
    return { id: 'direct-callback-fixture',tenantId: context.work.tenantId,runId: context.work.id,
      requestVersion: 1,skill: { name,version,hash },checker: 'product:visualize-delivery' }
  } }
}
