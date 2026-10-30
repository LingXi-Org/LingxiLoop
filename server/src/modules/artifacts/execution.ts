import type { RunIdentity, RunSnapshot, createLingxiOS } from '@lyyzka/lingxios'
import type { Queryable } from '../../db/queryable.js'
import type { ArtifactRow } from './repository-types.js'

type Control = Pick<Awaited<ReturnType<typeof createLingxiOS>>, 'readRun' | 'readMessage' | 'cancel' | 'sharedState' | 'conversations'>
export interface ArtifactRunRow {
  work_id: string; company_id: string; artifact_id: string; assignment_id: string | null
  agent_id: string; principal_id: string; session_id: string; thread_id: string | null; request_version: number
  execution_role: 'specialist' | 'verifier' | 'reporter'
}
export const artifactRunIdentity = (run: ArtifactRunRow): RunIdentity => ({ runId: run.work_id, tenantId: run.company_id,
  agentId: run.agent_id, principalId: run.principal_id, sessionId: run.session_id,
  ...(run.thread_id ? { threadId: run.thread_id } : {}) })

export async function bindArtifactRun(db: Queryable, run: ArtifactRunRow) {
  await db.query(`INSERT INTO artifact_agent_runs(work_id,company_id,artifact_id,assignment_id,agent_id,principal_id,
    session_id,thread_id,request_version,execution_role) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT(work_id,artifact_id) DO NOTHING`, [run.work_id,run.company_id,run.artifact_id,run.assignment_id,
    run.agent_id,run.principal_id,run.session_id,run.thread_id,run.request_version,run.execution_role])
}

/** Artifact owns its associations; only the public runtime API changes execution state. */
export function createArtifactExecution(control: () => Promise<Control>) {
  async function find(db: Queryable, artifact: ArtifactRow, workId: string | null) {
    const { rows } = await db.query<ArtifactRunRow>('SELECT * FROM artifact_agent_runs WHERE work_id=$1 AND artifact_id=$2 AND company_id=$3',
      [workId,artifact.id,artifact.company_id])
    if (!rows[0]) throw new Error('Artifact execution binding not found')
    return rows[0]
  }
  return {
    async cancel(db: Queryable, artifact: ArtifactRow, workId: string | null) {
      if (!workId) return false
      return (await control()).cancel(artifactRunIdentity(await find(db, artifact, workId)), db)
    },
    async read(db: Queryable, artifact: ArtifactRow, workId: string): Promise<RunSnapshot | null> {
      return (await control()).readRun(artifactRunIdentity(await find(db, artifact, workId)), db)
    },
  }
}
export type ArtifactExecution = ReturnType<typeof createArtifactExecution>
