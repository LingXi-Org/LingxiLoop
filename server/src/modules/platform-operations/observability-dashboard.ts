import {
  OPENPLAIT_API_VERSION,
  validateDashboard,
  validateQueryResult,
  type Dashboard,
  type DataField,
  type QueryResult,
} from '@openplait/core'
import { releaseVersions, type createLingxiOS } from '@lyyzka/lingxios'

const datasource = { kind: 'PostgresDatasource', name: 'lingxiloop', scope: 'dashboard' as const }

const dashboardDocument: Dashboard = {
  apiVersion: OPENPLAIT_API_VERSION,
  kind: 'Dashboard',
  metadata: { name: 'lingxiloop-ai-observability', displayName: 'AI 可观测' },
  spec: {
    display: { name: 'AI 可观测', description: 'Agent 运行量、可靠性、耗时与模型用量。' },
    datasources: {
      lingxiloop: {
        default: true,
        display: { name: 'LingxiLoop 运行账本' },
        plugin: { kind: 'PostgresDatasource', spec: { connectionRef: 'lingxiloop-primary' } },
      },
    },
    queries: {
      summary: { kind: 'Query', spec: { mode: 'semantic', datasource, input: { signal: 'traces', entity: 'lingxios.runs' }, select: [
        { aggregate: { function: 'count' }, as: 'runs' },
        { aggregate: { function: 'sum', field: 'gen_ai.usage.total_tokens' }, as: 'tokens' },
        { aggregate: { function: 'avg', field: 'duration' }, as: 'average_duration_ms' },
      ] } },
      trend: { kind: 'Query', spec: { mode: 'semantic', datasource, input: { signal: 'traces', entity: 'lingxios.runs' }, select: [
        { field: 'timestamp_bucket', as: 'time' },
        { aggregate: { function: 'count' }, as: 'runs' },
      ], groupBy: [{ timeBucket: { field: 'timestamp', interval: '1h', as: 'timestamp_bucket' } }] } },
      models: { kind: 'Query', spec: { mode: 'semantic', datasource, input: { signal: 'traces', entity: 'lingxios.runs' }, select: [
        { field: 'gen_ai.request.model', as: 'model' },
        { aggregate: { function: 'count' }, as: 'runs' },
        { aggregate: { function: 'sum', field: 'gen_ai.usage.total_tokens' }, as: 'tokens' },
      ], groupBy: [{ field: 'gen_ai.request.model' }], limit: 8 } },
      'recent-runs': { kind: 'Query', spec: { mode: 'semantic', datasource, input: { signal: 'traces', entity: 'lingxios.runs' }, select: [
        { field: 'trace.id', as: 'id' }, { field: 'timestamp' }, { field: 'status.code', as: 'status' },
        { field: 'gen_ai.request.model', as: 'model' }, { field: 'duration' },
      ], orderBy: [{ field: 'timestamp', direction: 'desc' }], limit: 30 } },
    },
    panels: {
      runs: { kind: 'Panel', spec: { display: { name: '运行' }, plugin: { kind: 'StatChart', spec: { dataMapping: { valueField: 'runs' } } }, queries: [{ kind: 'OpenPlaitQuery', spec: { queryRef: { $ref: '#/spec/queries/summary' } } }] } },
      reliability: { kind: 'Panel', spec: { display: { name: '成功率' }, plugin: { kind: 'StatChart', spec: { dataMapping: { valueField: 'success_rate' }, display: { unit: '%', decimals: 1 } } }, queries: [{ kind: 'OpenPlaitQuery', spec: { queryRef: { $ref: '#/spec/queries/summary' } } }] } },
      latency: { kind: 'Panel', spec: { display: { name: '平均耗时' }, plugin: { kind: 'StatChart', spec: { dataMapping: { valueField: 'average_duration_ms' }, display: { unit: 'ms' } } }, queries: [{ kind: 'OpenPlaitQuery', spec: { queryRef: { $ref: '#/spec/queries/summary' } } }] } },
      tokens: { kind: 'Panel', spec: { display: { name: 'Token' }, plugin: { kind: 'StatChart', spec: { dataMapping: { valueField: 'tokens' } } }, queries: [{ kind: 'OpenPlaitQuery', spec: { queryRef: { $ref: '#/spec/queries/summary' } } }] } },
      trend: { kind: 'Panel', spec: { display: { name: '24 小时运行趋势' }, plugin: { kind: 'TimeSeriesChart', spec: { dataMapping: { timeField: 'time', valueFields: ['runs', 'failures'] }, display: { legend: { position: 'bottom' } } } }, queries: [{ kind: 'OpenPlaitQuery', spec: { queryRef: { $ref: '#/spec/queries/trend' } } }] } },
      models: { kind: 'Panel', spec: { display: { name: '模型用量' }, plugin: { kind: 'Table', spec: { dataMapping: { fields: ['model', 'calls', 'tokens', 'cost_usd', 'unmeasured_calls'] }, display: { density: 'compact', showHeader: true } } }, queries: [{ kind: 'OpenPlaitQuery', spec: { queryRef: { $ref: '#/spec/queries/models' } } }] } },
      'recent-runs': { kind: 'Panel', spec: { display: { name: '最近运行' }, plugin: { kind: 'Table', spec: { dataMapping: { fields: ['timestamp', 'agent', 'model', 'status', 'duration_ms', 'tokens'] }, display: { density: 'compact', showHeader: true } } }, queries: [{ kind: 'OpenPlaitQuery', spec: { queryRef: { $ref: '#/spec/queries/recent-runs' } } }] } },
    },
    layouts: [{ kind: 'Grid', spec: { items: [
      { x: 0, y: 0, width: 6, height: 4, content: { $ref: '#/spec/panels/runs' } },
      { x: 6, y: 0, width: 6, height: 4, content: { $ref: '#/spec/panels/reliability' } },
      { x: 12, y: 0, width: 6, height: 4, content: { $ref: '#/spec/panels/latency' } },
      { x: 18, y: 0, width: 6, height: 4, content: { $ref: '#/spec/panels/tokens' } },
      { x: 0, y: 4, width: 16, height: 8, content: { $ref: '#/spec/panels/trend' } },
      { x: 16, y: 4, width: 8, height: 8, content: { $ref: '#/spec/panels/models' } },
      { x: 0, y: 12, width: 24, height: 10, content: { $ref: '#/spec/panels/recent-runs' } },
    ] } }],
    duration: '24h',
    refreshInterval: '30s',
  },
}

const dashboard = (() => {
  const validated = validateDashboard(dashboardDocument)
  if (!validated.valid) throw new Error(`invalid OpenPlait dashboard: ${JSON.stringify(validated.errors)}`)
  return validated.value
})()

function result(name: string, fields: DataField[], length: number): QueryResult {
  const candidate = { frames: [{ name, fields, length }], metadata: { datasource: 'lingxiloop', adapterVersion: `@lyyzka/lingxios/${releaseVersions.runtime}`, rowsReturned: length } }
  const validated = validateQueryResult(candidate)
  if (!validated.valid) throw new Error(`invalid OpenPlait query result: ${JSON.stringify(validated.errors)}`)
  return validated.value
}

export async function observabilityDashboard(runtime: Pick<Awaited<ReturnType<typeof createLingxiOS>>, 'readOperations' | 'listRuns'>) {
  const [summary, page] = await Promise.all([runtime.readOperations(), runtime.listRuns({ limit: 30 })])
  const successRate = summary.finished ? summary.successes / summary.finished * 100 : 0
  const runs = page.items
  return {
    dashboard,
    observedAt: new Date().toISOString(),
    results: {
      summary: result('summary', [
        { name: 'runs', type: 'number', values: [Number(summary.runs)] },
        { name: 'success_rate', type: 'number', values: [successRate], unit: '%' },
        { name: 'average_duration_ms', type: 'duration', values: [Number(summary.averageExecutionMs)], unit: 'ms' },
        { name: 'tokens', type: 'number', values: [Number(summary.tokens)] },
        { name: 'successes', type: 'number', values: [Number(summary.successes)] },
        { name: 'failures', type: 'number', values: [Number(summary.failures)] },
        { name: 'active', type: 'number', values: [Number(summary.active)] },
        { name: 'queued', type: 'number', values: [summary.queued] },
        { name: 'waiting', type: 'number', values: [summary.waiting] },
        { name: 'failed_deliveries', type: 'number', values: [summary.failedDeliveries] },
        { name: 'failed_usage_deliveries', type: 'number', values: [summary.failedUsageDeliveries] },
        { name: 'failed_memory_captures', type: 'number', values: [summary.failedMemoryCaptures] },
      ], 1),
      trend: result('trend', [
        { name: 'time', type: 'time', values: summary.trend.map((row) => row.time) },
        { name: 'runs', type: 'number', values: summary.trend.map((row) => Number(row.runs)) },
        { name: 'failures', type: 'number', values: summary.trend.map((row) => Number(row.failures)) },
      ], summary.trend.length),
      models: result('models', [
        { name: 'model', type: 'string', values: summary.models.map((row) => row.model) },
        { name: 'calls', type: 'number', values: summary.models.map((row) => row.calls) },
        { name: 'tokens', type: 'number', values: summary.models.map((row) => row.tokens) },
        { name: 'cost_usd', type: 'number', values: summary.models.map(row => row.costMicros / 1_000_000) },
        { name: 'unmeasured_calls', type: 'number', values: summary.models.map(row => row.unmeasuredCalls) },
      ], summary.models.length),
      recentRuns: result('recent-runs', [
        { name: 'id', type: 'trace', values: runs.map((row) => row.id) },
        { name: 'timestamp', type: 'time', values: runs.map((row) => row.createdAt) },
        { name: 'agent', type: 'string', values: runs.map((row) => row.identity.agentId) },
        { name: 'company', type: 'string', values: runs.map((row) => row.identity.tenantId) },
        { name: 'model', type: 'string', values: runs.map((row) => row.model || '未知模型') },
        { name: 'status', type: 'string', values: runs.map((row) => row.status) },
        { name: 'duration_ms', type: 'duration', values: runs.map((row) => Number(row.executionMs)), unit: 'ms' },
        { name: 'tokens', type: 'number', values: runs.map((row) => Number(row.tokens)) },
        { name: 'cost_usd', type: 'number', values: runs.map(row => row.costMicros / 1_000_000) },
        { name: 'unmeasured_calls', type: 'number', values: runs.map(row => row.unmeasuredCalls) },
        { name: 'error', type: 'string', values: runs.map((row) => row.error) },
      ], runs.length),
    },
  }
}
