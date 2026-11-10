import { NoEffectError, toolContractHash, type ActionContext, type ActionResult, type ToolDefinition } from '@lingxi-org/lingxios'
import { z } from 'zod'
import { artifactIdSchema } from '../../../../shared/artifact-document.js'
import { artifactOperationBatchSchema, prepareBatch } from '../../../../shared/artifact-operations.js'
import type { Queryable } from '../../db/queryable.js'
import { agentArtifactSchemas } from './contracts.js'
import { ensureNativeDocument, readNativeDocumentRevision } from './native-document.js'
import type { ArtifactKind } from './kinds.js'
import type { ArtifactRow } from './repository.js'
import { sha256 } from './store.js'

const planSchema = z.object({ planId: z.string().min(1).max(512), artifactId: artifactIdSchema,
  batch: artifactOperationBatchSchema, sourceVersion: z.string().min(1).max(200).optional() }).strict()
type PlanIntent = { tenantId: string; workId: string; principalId: string | null; agentId: string; sessionId: string;
  threadId: string | null; requestVersion: number | null; toolContractHash: string;
  action: { action: string; idempotencyKey: string; args: unknown } }

/** Preparation is read-only and uses exactly the revision the author observed. */
export async function prepareNativeAgentPlan(context: ActionContext, artifact: ArtifactRow, input: z.output<typeof agentArtifactSchemas.prepare_ops>) {
  const db = context.database as Queryable
  let document = await readNativeDocumentRevision(db, artifact.id, input.baseSeq)
  if (!document && input.sourceVersion) {
    const source = await ensureNativeDocument({ db, transaction: run => run(db) }, {
      artifactId: artifact.id, companyId: context.work.tenantId, actorId: context.work.agentId, write: false, expectedSourceVersion: input.sourceVersion,
    })
    if (!Object.keys(source.pageVersions).length && source.document.seq === input.baseSeq) document = source.document
  }
  if (!document) throw new NoEffectError('固定版本不存在，请重新读取文档及目标页面后再准备修改。', 'not_found')
  const planId = context.action.idempotencyKey
  let batch: z.output<typeof artifactOperationBatchSchema>
  try { batch = prepareBatch(document, input.operations, sha256(Buffer.from(planId))) }
  catch { throw new NoEffectError('操作与固定快照不匹配，请读取目标并修正操作后再准备。', 'invalid_input') }
  return { planId, artifactId: artifact.id, batch, ...(input.sourceVersion ? { sourceVersion: input.sourceVersion } : {}) }
}

/** The SDK ledger owns the immutable plan. No caller can replace its batch or target. */
export async function readNativeAgentPlan(context: ActionContext, kind: ArtifactKind, sourceTool: ToolDefinition, input: z.output<typeof agentArtifactSchemas.apply_ops>) {
  const row = (await (context.database as Queryable).query<{ intent: PlanIntent; result: ActionResult }>(`SELECT i.intent,COALESCE(resolved.result,r.result) AS result
    FROM lingxios.agent_action_intents i LEFT JOIN lingxios.agent_action_ledger r USING(idempotency_key)
    LEFT JOIN LATERAL (SELECT resolution->'result' AS result FROM lingxios.agent_action_resolutions
      WHERE idempotency_key=i.idempotency_key ORDER BY resolution_seq DESC LIMIT 1) resolved ON TRUE
    WHERE i.idempotency_key=$1`, [input.planId])).rows[0]
  const intent = row?.intent, result = row?.result, work = context.work
  if (!intent || intent.tenantId !== work.tenantId || intent.workId !== work.id || intent.principalId !== (work.principalId ?? null)
    || intent.agentId !== work.agentId || intent.sessionId !== work.sessionId || intent.threadId !== (work.threadId ?? null)
    || intent.requestVersion !== context.requestVersion || intent.action.action !== `${kind}.prepare_ops`
    || intent.action.idempotencyKey !== input.planId || intent.toolContractHash !== toolContractHash(sourceTool)
    || !result?.ok || result.approval || result.directive || result.executionState === 'unknown') {
    throw new NoEffectError('操作准备记录不属于当前请求，或尚未成功完成。请重新读取并准备。', 'forbidden')
  }
  const plan = planSchema.parse(result.value), source = agentArtifactSchemas.prepare_ops.parse(intent.action.args)
  if (plan.planId !== input.planId || plan.batch.operationId !== sha256(Buffer.from(input.planId)) || plan.batch.baseSeq !== source.baseSeq
    || JSON.stringify(plan.batch.operations) !== JSON.stringify(source.operations) || plan.sourceVersion !== source.sourceVersion
    || source.artifactId !== undefined && source.artifactId !== plan.artifactId || input.artifactId !== undefined && input.artifactId !== plan.artifactId) {
    throw new NoEffectError('操作准备记录的目标或内容不一致。请重新读取并准备。', 'forbidden')
  }
  return plan
}
