import type { createLingxiOS, RunSnapshot } from '@lyyzka/lingxios'
import type { Queryable } from '../../db/queryable.js'
import { activityAgentNames } from './repository.js'

const titles: Record<RunSnapshot['status'], string> = {
  queued: '等待执行', leased: '正在处理', waiting: '等待回复或审批', succeeded: '已完成',
  partial: '部分完成', blocked: '需要处理阻碍', failed: '执行失败', cancelled: '已取消',
}

export class ObservabilityApplication {
  constructor(private readonly db: Queryable, private readonly runtime: () => Promise<Pick<Awaited<ReturnType<typeof createLingxiOS>>, 'listRuns'>>) {}

  async activity(companyId: string, conversationId: string) {
    const bindings = await this.db.query<{ run_id: string }>('SELECT run_id FROM agent_run_bindings WHERE company_id=$1 AND conversation_id=$2 AND NOT internal ORDER BY created_at DESC LIMIT 12', [companyId,conversationId])
    const api = await this.runtime(), items = []
    for (const binding of bindings.rows) {
      const page = await api.listRuns({ tenantId: companyId, id: binding.run_id, limit: 1 })
      items.push(...page.items)
    }
    const names = await activityAgentNames(this.db, companyId, items.map(run => run.identity.agentId))
    return items.reverse().map(run => ({
      id: run.id, runId: run.id, agentId: run.identity.agentId, agentName: names.get(run.identity.agentId) ?? run.identity.agentId,
      runStatus: run.status, kind: `run.${run.status}`, level: run.status === 'failed' ? 'error' : 'info',
      title: titles[run.status], createdAt: run.createdAt,
    }))
  }
}
