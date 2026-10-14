import type { RunIdentity, RunSnapshot, createLingxiOS } from '@lyyzka/lingxios'
import type { Queryable } from '../../db/queryable.js'
import type { CanvasRow } from './repository-types.js'

type Control = Pick<Awaited<ReturnType<typeof createLingxiOS>>, 'readRun' | 'readMessage' | 'cancel' | 'sharedState' | 'conversations'>
export interface CanvasRunRow {
  work_id: string; company_id: string; canvas_id: string; assignment_id: string | null
  agent_id: string; principal_id: string; session_id: string; thread_id: string | null; request_version: number
  execution_role: 'specialist' | 'verifier' | 'reporter'
}
export const canvasRunIdentity = (run: CanvasRunRow): RunIdentity => ({ runId: run.work_id, tenantId: run.company_id,
  agentId: run.agent_id, principalId: run.principal_id, sessionId: run.session_id,
  ...(run.thread_id ? { threadId: run.thread_id } : {}) })

export async function bindCanvasRun(db: Queryable, run: CanvasRunRow) {
  await db.query(`INSERT INTO canvas_agent_runs(work_id,company_id,canvas_id,assignment_id,agent_id,principal_id,
    session_id,thread_id,request_version,execution_role) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT(work_id,canvas_id) DO NOTHING`, [run.work_id,run.company_id,run.canvas_id,run.assignment_id,
    run.agent_id,run.principal_id,run.session_id,run.thread_id,run.request_version,run.execution_role])
}

/** Canvas owns its associations; only the public runtime API changes execution state. */
export function createCanvasExecution(control: () => Promise<Control>) {
  async function find(db: Queryable, canvas: CanvasRow, workId: string | null) {
    const { rows } = await db.query<CanvasRunRow>('SELECT * FROM canvas_agent_runs WHERE work_id=$1 AND canvas_id=$2 AND company_id=$3',
      [workId,canvas.id,canvas.company_id])
    if (!rows[0]) throw new Error('Canvas execution binding not found')
    return rows[0]
  }
  return {
    async cancel(db: Queryable, canvas: CanvasRow, workId: string | null) {
      if (!workId) return false
      return (await control()).cancel(canvasRunIdentity(await find(db, canvas, workId)), db)
    },
    async read(db: Queryable, canvas: CanvasRow, workId: string): Promise<RunSnapshot | null> {
      return (await control()).readRun(canvasRunIdentity(await find(db, canvas, workId)), db)
    },
  }
}
export type CanvasExecution = ReturnType<typeof createCanvasExecution>
