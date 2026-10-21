import { createHash } from 'node:crypto'
import { basename } from 'node:path'
import { NoEffectError, skillIndex, type RunVerificationContext, type SkillDeliveryDecision, type VerificationRecord } from '@lyyzka/lingxios'
import { authorizeAudienceRead } from '../agents/tools.js'
import { ForbiddenError } from '../modules/access/public.js'
import { HttpError } from '../http/errors.js'
import { assertVisualizeActor, readAuthorizedVisualizeSnapshot, validateVisualizeFragment } from '../im/visualize.js'
import type { Queryable } from '../db/queryable.js'
import { loadRuntimeBinding } from './context.js'
import { assertFrozenAudience, productConversationId } from './identity.js'
import { visualizeSkill } from './visualize-skill.js'
import { projectGenUiReferences } from '../../../src/features/chat/visualize/zcode/gen-ui/domain/references.js'

// This exact, public text can resolve only a native-confirmed unavailable contract.
// A model's inability claim, a tool admission error, or an export cap is no proof.
export const VISUALIZE_UNAVAILABLE_TEXT = '当前可视化交付所需的授权或技能版本已不可用，因此未交付可视化。'
const checker = 'product:visualize-delivery'
const pending = (activationId: string, hint: string): SkillDeliveryDecision => ({ activationId,outcome: 'pending',evidence: { hint } })
const missingReferenceHint = 'Authoring is activated but no complete usable visualization reference was delivered. Use the literal reference from the current checked save/read result outside code. Correct known content errors before delivery; save and read back a new fragment only if none exists or its content needs correction.'

/** Bounded repair observations, never a delivery decision or an HTML response.
 * Scope and audience checks precede even the path query. Final verification
 * still rechecks access, current authorship and storage after this snapshot. */
async function savedRepairCandidates(context: RunVerificationContext) {
  const database = context.database as Queryable, { work } = context
  const channelId = productConversationId(work)
  await loadRuntimeBinding({ ...work, conversationId: channelId }, database)
  await assertFrozenAudience(database, work)
  await authorizeAudienceRead(context, { action: 'conversation:read', resource: { type: 'conversation', id: channelId } })
  const actor = { companyId: work.tenantId, channelId, userId: work.principalId! }
  await assertVisualizeActor(database, actor)
  const rows = await database.query<{ path: string }>(`SELECT path FROM im_visualize_documents
    WHERE company_id=$1 AND channel_id=$2 AND run_id=$3 AND agent_id=$4 AND created_by=$5 AND request_version=$6
    ORDER BY path ASC LIMIT 4`, [work.tenantId, channelId, work.id, work.agentId, work.principalId, context.requestVersion])
  const savedCandidates: Array<{ reference: string; version: number; sourceHash: string }> = []
  for (const { path } of rows.rows.slice(0, 3)) {
    context.signal.throwIfAborted()
    const doc = await readAuthorizedVisualizeSnapshot({ ...actor, path }, database)
    // A callback can use a pool outside a transaction in a diagnostic fixture;
    // recheck identity after the discovery query as well as at final commit.
    if (doc.run_id !== work.id || doc.agent_id !== work.agentId || doc.created_by !== work.principalId
      || doc.request_version !== context.requestVersion) continue
    try { validateVisualizeFragment(basename(doc.path), doc.html) }
    catch (error) { if (error instanceof HttpError && error.status === 400) continue; throw error }
    const sourceHash = createHash('sha256').update(doc.html).digest('hex')
    if (sourceHash !== doc.source_hash) continue
    savedCandidates.push({ reference: `::visualize${JSON.stringify({ path: doc.path })}`, version: doc.version, sourceHash })
  }
  return { savedCandidates, candidatesTruncated: rows.rows.length > 3 }
}

/** Native pending decisions keep the final guard closed but are inconclusive.
 * The public failed-check channel explicitly asks the worker to repair the gap;
 * it does not resolve the obligation as failed or delivered. */
export async function verifyVisualizeAuthoringCandidate(context: RunVerificationContext): Promise<VerificationRecord[]> {
  const decisions = await verifyVisualizeDelivery(context)
  const gaps = decisions.filter(decision => decision.outcome === 'pending')
  const nonDelivery = decisions.filter(decision => decision.outcome === 'unsupported' || decision.outcome === 'failed')
  let repair: Awaited<ReturnType<typeof savedRepairCandidates>> | undefined
  if (gaps.some(gap => gap.evidence.missingReference === true)) {
    try { repair = await savedRepairCandidates(context) }
    catch (error) {
      context.signal.throwIfAborted()
      // Authorization/resource changes reveal no candidates. Infrastructure
      // errors must not masquerade as an empty, successful lookup.
      if (!(error instanceof HttpError) && !(error instanceof NoEffectError) && !(error instanceof ForbiddenError)) throw error
    }
  }
  const records: VerificationRecord[] = gaps.length ? [{ checker: 'product:visualize-authoring',status: 'failed',evidence: {
    hint: repair?.savedCandidates.length
      ? 'The final answer lacks a usable reference. These are authorized current-request storage snapshots, not proof of semantic correctness or browser execution. Reconcile known errors first. If the selected version has already been read back and checked with no known errors, use its exact literal reference outside code in the final answer; do not save again merely to obtain a reference. If content is wrong, correct and read back that content before delivery. Do not deliver an older draft or choose a candidate only because of its version number.'
      : gaps.map(gap => String(gap.evidence.hint)).join('\n'),
    ...(repair ?? {}),
    pendingActivationIds: gaps.map(gap => gap.activationId),deliveryProven: false,
  } }] : []
  // Native may durably resolve an honest non-delivery, but it cannot satisfy
  // authoring. Keep a real resource gap so the public envelope remains partial.
  if (nonDelivery.length) records.push({ checker: 'product:visualize-nondelivery',status: 'inconclusive',evidence: {
    reason: 'Activated visualization authoring was not delivered.',
    outcomes: nonDelivery.map(({ activationId,outcome }) => ({ activationId,outcome })),deliveryProven: false,
  } })
  return records
}

/** Final transaction readback checks storage/access, not model or browser execution.
 * Native owns activation and resolution persistence; no private receipt is read. */
export async function verifyVisualizeDelivery(context: RunVerificationContext): Promise<SkillDeliveryDecision[]> {
  const activations = context.skillActivations.filter(activation => activation.checker === checker && activation.skill.name === visualizeSkill.name)
  if (!activations.length) return []
  const index = skillIndex(visualizeSkill), decisions: SkillDeliveryDecision[] = []
  const { work } = context, database = context.database as Queryable
  for (const activation of activations) {
    context.signal.throwIfAborted()
    if (activation.tenantId !== work.tenantId || activation.runId !== work.id
      || activation.requestVersion !== context.requestVersion || context.candidate.requestVersion !== context.requestVersion) {
      decisions.push(pending(activation.id, 'The authoring obligation and candidate must belong to the same current request.')); continue
    }
    if (context.unavailableSkillActivationIds.includes(activation.id)) {
      decisions.push(context.candidate.body.trim() === VISUALIZE_UNAVAILABLE_TEXT
        ? { activationId: activation.id,outcome: 'unsupported',evidence: { reason: 'native_contract_unavailable',delivered: false,userVisibleExplanation: VISUALIZE_UNAVAILABLE_TEXT } }
        : pending(activation.id, `The native runtime reports that this obligation's contract or required authorization is unavailable. Do not claim delivery. Explain the observed non-delivery using exactly: ${VISUALIZE_UNAVAILABLE_TEXT}`))
      continue
    }
    if (activation.skill.version !== index.version || activation.skill.hash !== index.hash) {
      decisions.push(pending(activation.id, 'The activated authoring contract has changed; do not claim delivery.')); continue
    }
    const parts = projectGenUiReferences(context.candidate.body, true)
    const references = parts.flatMap(part => part.kind === 'ui' ? [part.reference] : [])
    if (!references.length || references.length > 32 || parts.some(part => part.kind === 'invalid' || part.kind === 'pending')) {
      decisions.push({ activationId: activation.id, outcome: 'pending', evidence: { missingReference: true, hint: missingReferenceHint } }); continue
    }
    try {
      const channelId = productConversationId(work)
      await loadRuntimeBinding({ ...work,conversationId: channelId }, database)
      await assertFrozenAudience(database,work)
      await authorizeAudienceRead(context,{ action: 'conversation:read',resource: { type: 'conversation',id: channelId } })
      let authored = false
      const evidence: Array<{ path: string; sourceHash: string; version: number }> = []
      for (const reference of references) {
        context.signal.throwIfAborted()
        const doc = await readAuthorizedVisualizeSnapshot({ companyId: work.tenantId,channelId,userId: work.principalId!,path: reference.path },database)
        validateVisualizeFragment(basename(doc.path),doc.html)
        const sourceHash = createHash('sha256').update(doc.html).digest('hex')
        if (sourceHash !== doc.source_hash) throw new HttpError(409, 'Saved visualization integrity changed.')
        if (doc.run_id === work.id && doc.agent_id === work.agentId && doc.created_by === work.principalId
          && doc.request_version === context.requestVersion) authored = true
        evidence.push({ path: doc.path,sourceHash,version: doc.version })
      }
      decisions.push(authored ? { activationId: activation.id,outcome: 'delivered',evidence: {
        requestVersion: context.requestVersion,references: evidence,storageReadback: true,modelReadbackProven: false,browserRenderingProven: false,
      } } : pending(activation.id, 'Referenced content is readable but none was saved by this agent and principal in this run and current request. Save and read back the current requested visualization before delivery.'))
    } catch (error) {
      context.signal.throwIfAborted()
      // Expected resource/access changes permit native repair. Infrastructure and
      // transaction failures propagate; they are never converted to delivery.
      if (!(error instanceof HttpError) && !(error instanceof NoEffectError) && !(error instanceof ForbiddenError)) throw error
      decisions.push(pending(activation.id, 'A visualization reference is unavailable, unauthorized or changed. Recheck current access and the actual saved fragment; do not claim delivery from a failed or stale reference.'))
    }
  }
  return decisions
}
