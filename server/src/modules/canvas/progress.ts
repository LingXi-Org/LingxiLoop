import type { Queryable } from '../../db/queryable.js'

/** Compare, version and enqueue the persisted business snapshot in one statement. */
export async function publishCanvasProgress(db: Queryable, companyId: string, canvasId: string) {
  await db.query(`WITH snapshot AS (
    SELECT canvas.id,jsonb_build_object('canvasId',canvas.id,'title',canvas.title,'goal',canvas.goal,
      'status',canvas.status,'coordinatorAgentId',canvas.initiator_agent_id,'assignments',COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id',assignment.id,'agentId',assignment.agent_id,
          'task',assignment.assignment,'status',assignment.status,'executionRole',assignment.execution_role) ORDER BY assignment.id)
        FROM canvas_agent_assignments assignment WHERE assignment.canvas_id=canvas.id
      ),'[]'::jsonb)) AS data
    FROM canvases canvas WHERE canvas.company_id=$1 AND canvas.id=$2 AND canvas.conversation_id IS NOT NULL
      AND canvas.initiator_agent_id IS NOT NULL FOR UPDATE OF canvas
  ), changed AS (
    UPDATE canvases canvas SET progress_version=progress_version+1,progress_snapshot=snapshot.data
    FROM snapshot WHERE canvas.id=snapshot.id AND canvas.progress_snapshot IS DISTINCT FROM snapshot.data
    RETURNING canvas.*
  ) INSERT INTO agent_native_event_outbox(id,company_id,work_id,event)
    SELECT 'canvas:'||id||':'||progress_version,company_id,'canvas:'||id,
      jsonb_build_object('type','im.system','companyId',company_id,'actorId',initiator_agent_id,
        'channelId',conversation_id,'clientNonce','canvas:'||id||':'||progress_version,'payload',
        jsonb_strip_nulls(jsonb_build_object('version',1,'kind','canvas','clientMsgNo','canvas:'||id||':'||progress_version,
          'body',title,'replyToClientMsgNo',NULLIF(shared_state_thread_key,''),'data',
          progress_snapshot||jsonb_build_object('progressVersion',progress_version,'updatedAt',clock_timestamp(),'suppressAgentWake',true))))
    FROM changed ON CONFLICT DO NOTHING`, [companyId,canvasId])
}
