import type { ActionContext, ActionResult, RunIdentity } from '@lyyzka/lingxios'
import { pool, presentationPool } from '../db/pool.js'
import type { Queryable } from '../db/queryable.js'
import { toolDisplay, toolDisplaySchema, type ToolDisplay } from '../../../src/lib/runActivity.js'

export interface PublicToolActivity {
  toolCallId: string
  display: ToolDisplay
  timing: { startedAt: number; completedAt?: number }
}

/** Optional display only: required authorization/approval/terminal reads never use this pool. */
export async function readOptionalToolActivity(identity: RunIdentity, requestSignal?: AbortSignal): Promise<PublicToolActivity[]> {
  if (requestSignal?.aborted) return []
  const deadline = new AbortController()
  const timer = setTimeout(() => deadline.abort(), 100)
  const signal = requestSignal ? AbortSignal.any([requestSignal, deadline.signal]) : deadline.signal
  try {
    // pg's acquisition timeout removes queued waiters and destroys timed-out
    // connections. An aborted acquisition can live for at most those 75 ms.
    const client = await presentationPool.connect()
    let released = false
    const release = (destroy = false) => {
      if (released) return
      released = true
      client.release(destroy)
    }
    // pg-pool removes its idle error listener while a client is checked out.
    // Socket errors must not become process-level uncaught exceptions.
    const connectionError = () => release(true)
    client.on('error', connectionError)
    // Destroying an active pg client closes its socket, interrupting real SQL.
    // The server-side statement timeout independently bounds lock/CPU waits.
    const abort = () => release(true)
    signal.addEventListener('abort', abort, { once: true })
    try {
      signal.throwIfAborted()
      const records = await readPublicToolActivity(identity, client)
      return signal.aborted ? [] : records
    } finally {
      signal.removeEventListener('abort', abort)
      release(signal.aborted)
      client.off('error', connectionError)
    }
  } catch {
    // Keep authoritative event contents and the existing generic display.
    return []
  } finally { clearTimeout(timer) }
}

const inputFields: Record<string, readonly [string, string][]> = {
  'research.search': [['query', '查找内容']], 'research.read': [['url', '网页']],
  'knowledge.search': [['query', '查找内容']], 'knowledge.add_text': [['title', '资料名称']], 'knowledge.add_url': [['url', '网页']],
  'documents.create': [['title', '文档名称']], 'documents.rename': [['title', '新名称']],
  'files.create': [['name', '文件名称']], 'chat.rename': [['title', '对话名称']], 'chat.search': [['query', '查找内容']],
  'chat.ask': [['question', '需要补充']], 'polls.create': [['question', '投票问题']],
  'canvas.start_workspace': [['title', '协作任务']], 'canvas.create_frame': [['title', '内容名称']],
  'presentations.create': [['title', '演示文稿名称']], 'routines.create': [['name', '定时任务名称']],
}

function publicField(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim() || value.length > 500 || /(?:[A-Z]:\\|\/tmp\/|\/home\/|<\/?(?:think|system|analysis|scratchpad)>|\bBearer\s+|sk-[a-zA-Z0-9]{16,})/i.test(value)) return undefined
  return value.trim()
}

export async function beginPublicToolActivity(context: ActionContext, input: Record<string, unknown>): Promise<ToolDisplay | undefined> {
  if (context.work.conversation?.internal) return undefined
  // Presentation failures must not poison the owning business transaction.
  const db = pool, action = context.action.action
  const display = toolDisplay(action)
  const fields = (inputFields[action] ?? []).flatMap(([key, label]) => {
    const value = publicField(input[key])
    return value ? [{ label, value }] : []
  })
  if (action.startsWith('documents.') && typeof input.documentId === 'string') {
    // The owning tool already authorized this document and its frozen audience.
    const row = (await db.query<{ title: string }>('SELECT title FROM documents WHERE company_id=$1 AND id=$2', [context.work.tenantId, input.documentId])).rows[0]
    const title = publicField(row?.title)
    if (title) fields.unshift({ label: '文档', value: title })
  }
  if (fields.length) display.input = fields
  const saved = await db.query(`INSERT INTO agent_public_tool_activity(company_id,run_id,tool_call_id,display)
    SELECT company_id,run_id,$3,$4::jsonb FROM agent_run_bindings
    WHERE company_id=$1 AND run_id=$2 AND principal_id=$5 AND agent_id=$6 AND NOT internal
    ON CONFLICT(company_id,run_id,tool_call_id) DO UPDATE SET display=EXCLUDED.display RETURNING tool_call_id`,
  [context.work.tenantId, context.work.id, `host:${context.action.idempotencyKey}`, JSON.stringify(display), context.work.principalId, context.work.agentId])
  if (saved.rows.length !== 1) return undefined
  return display
}

export async function finishPublicToolActivity(context: ActionContext, display: ToolDisplay, result?: ActionResult): Promise<void> {
  const action = context.action.action, value = result?.value
  let summary = !result ? '这一步未完成，请重试。' : result.ok ? '这一步已完成。'
    : result.executionState === 'unknown' ? '操作结果尚未确认，请先核对结果，避免重复执行。' : '这一步未完成，请重试。'
  if (result?.ok) {
    if (action === 'files.list' && Array.isArray(value)) summary = `已检查本次请求的附件，共 ${value.length} 个。`
    else if (action === 'files.create') summary = '文件已生成，可在答复附件中下载。'
    else if (action.startsWith('documents.')) summary = ({ read: '已阅读文档内容。', create: '文档已创建，可在答复附件中查看。', edit: '文档修改已保存，可在答复附件中查看。', rename: '文档名称已更新。', delete: '文档已删除。', list: '已查看当前有权访问的文档。', recent: '已查看最近创建的文档。' } as Record<string, string>)[action.split('.')[1]] ?? summary
    else if (action === 'research.read') summary = '已阅读网页内容，引用依据会在答复中注明。'
    else if (action === 'research.search') summary = '查找已完成，可在下方查看来源。'
    else if (action === 'knowledge.read_source') summary = '已阅读课程原文，引用依据会在答复中注明。'
    else if (action === 'knowledge.search') summary = '检索已完成，可在下方查看资料结果。'
    else if (action === 'chat.report_progress') summary = '公开任务说明已更新。'
    else if (action === 'chat.ask') summary = '已提出补充问题，等待你的回答。'
    else if (action === 'handoffs.create' || action === 'canvas.assign') summary = '协作任务已提交，后续结果将按实际执行情况更新。'
  }
  await pool.query(`UPDATE agent_public_tool_activity SET display=$4::jsonb,completed_at=clock_timestamp()
    WHERE company_id=$1 AND run_id=$2 AND tool_call_id=$3`,
  [context.work.tenantId, context.work.id, `host:${context.action.idempotencyKey}`, JSON.stringify(toolDisplaySchema.parse({ ...display, summary }))])
}

/** Caller has already authorized the run; the join rechecks its tenant/principal binding. */
export async function readPublicToolActivity(identity: RunIdentity, db: Queryable = pool): Promise<PublicToolActivity[]> {
  const { rows } = await db.query<{ tool_call_id: string; display: unknown; started_at: Date; completed_at: Date | null }>(`SELECT a.tool_call_id,a.display,a.started_at,a.completed_at
    FROM agent_public_tool_activity a JOIN agent_run_bindings b ON b.run_id=a.run_id AND b.company_id=a.company_id
    WHERE a.company_id=$1 AND a.run_id=$2 AND b.agent_id=$3 AND b.principal_id=$4 AND b.session_id=$5 AND NOT b.internal
    ORDER BY a.started_at,a.tool_call_id`, [identity.tenantId, identity.runId, identity.agentId, identity.principalId, identity.sessionId])
  return rows.map(row => ({ toolCallId: row.tool_call_id, display: toolDisplaySchema.parse(row.display),
    timing: { startedAt: row.started_at.getTime(), ...(row.completed_at ? { completedAt: row.completed_at.getTime() } : {}) } }))
}
