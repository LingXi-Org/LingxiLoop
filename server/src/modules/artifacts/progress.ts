import type { Queryable } from '../../db/queryable.js'

/** Compare, version and enqueue the persisted business snapshot in one statement. */
export async function publishArtifactProgress(db: Queryable, companyId: string, artifactId: string) {
  await db.query(`WITH snapshot AS (
    SELECT artifact.id,jsonb_build_object('artifactId',artifact.id,'kind',artifact.kind,'title',artifact.title,'goal',artifact.goal,
      'status',artifact.status,'coordinatorAgentId',artifact.initiator_agent_id,'assignments',COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id',assignment.id,'agentId',assignment.agent_id,
          'task',assignment.assignment,'status',assignment.status,'executionRole',assignment.execution_role) ORDER BY assignment.id)
        FROM artifact_agent_assignments assignment WHERE assignment.artifact_id=artifact.id
      ),'[]'::jsonb)) AS data
    FROM artifacts artifact WHERE artifact.company_id=$1 AND artifact.id=$2 AND artifact.conversation_id IS NOT NULL
      AND artifact.initiator_agent_id IS NOT NULL FOR UPDATE OF artifact
  ), changed AS (
    UPDATE artifacts artifact SET progress_version=progress_version+1,progress_snapshot=snapshot.data
    FROM snapshot WHERE artifact.id=snapshot.id AND artifact.progress_snapshot IS DISTINCT FROM snapshot.data
    RETURNING artifact.*
  ) INSERT INTO agent_native_event_outbox(id,company_id,work_id,event)
    SELECT 'artifact:'||id||':'||progress_version,company_id,'artifact:'||id,
      jsonb_build_object('type','im.system','companyId',company_id,'actorId',initiator_agent_id,
        'channelId',conversation_id,'clientNonce','artifact:'||id||':'||progress_version,'payload',
        jsonb_build_object('id','artifact:'||id,'role','assistant','createdAt',clock_timestamp(),
          'content',jsonb_build_array(jsonb_build_object('type','data','name','artifact','data',
            progress_snapshot||jsonb_build_object('progressVersion',progress_version,'updatedAt',clock_timestamp()))),
          'status',jsonb_build_object('type','complete','reason','stop'),
          'metadata',jsonb_build_object('unstable_state',NULL,'unstable_annotations','[]'::jsonb,'unstable_data','[]'::jsonb,'steps','[]'::jsonb,
            'custom',jsonb_strip_nulls(jsonb_build_object('replyToClientMsgNo',NULLIF(shared_state_thread_key,''),'progressVersion',progress_version,'suppressAgentWake',true)))))
    FROM changed ON CONFLICT DO NOTHING`, [companyId,artifactId])
}
