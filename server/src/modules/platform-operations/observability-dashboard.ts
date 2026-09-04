import {
  OPENPLAIT_API_VERSION,
  validateDashboard,
  validateQueryResult,
  type Dashboard,
  type DataField,
  type QueryResult,
} from '@openplait/core'
import type { Queryable } from '../../db/queryable.js'

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
      summary: { kind: 'Query', spec: { mode: 'semantic', datasource, input: { signal: 'traces', entity: 'lingxiloop.agent_runs' }, select: [
        { aggregate: { function: 'count' }, as: 'runs' },
        { aggregate: { function: 'sum', field: 'gen_ai.usage.total_tokens' }, as: 'tokens' },
        { aggregate: { function: 'avg', field: 'duration' }, as: 'average_duration_ms' },
      ] } },
      trend: { kind: 'Query', spec: { mode: 'semantic', datasource, input: { signal: 'traces', entity: 'lingxiloop.agent_runs' }, select: [
        { field: 'timestamp_bucket', as: 'time' },
        { aggregate: { function: 'count' }, as: 'runs' },
      ], groupBy: [{ timeBucket: { field: 'timestamp', interval: '1h', as: 'timestamp_bucket' } }] } },
      models: { kind: 'Query', spec: { mode: 'semantic', datasource, input: { signal: 'traces', entity: 'lingxiloop.agent_runs' }, select: [
        { field: 'gen_ai.request.model', as: 'model' },
        { aggregate: { function: 'count' }, as: 'runs' },
        { aggregate: { function: 'sum', field: 'gen_ai.usage.total_tokens' }, as: 'tokens' },
      ], groupBy: [{ field: 'gen_ai.request.model' }], limit: 8 } },
      'recent-runs': { kind: 'Query', spec: { mode: 'semantic', datasource, input: { signal: 'traces', entity: 'lingxiloop.agent_runs' }, select: [
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
      models: { kind: 'Panel', spec: { display: { name: '模型用量' }, plugin: { kind: 'Table', spec: { dataMapping: { fields: ['model', 'runs', 'tokens'] }, display: { density: 'compact', showHeader: true } } }, queries: [{ kind: 'OpenPlaitQuery', spec: { queryRef: { $ref: '#/spec/queries/models' } } }] } },
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
  const candidate = { frames: [{ name, fields, length }], metadata: { datasource: 'lingxiloop', adapterVersion: 'postgres-ledger/v1', rowsReturned: length } }
  const validated = validateQueryResult(candidate)
  if (!validated.valid) throw new Error(`invalid OpenPlait query result: ${JSON.stringify(validated.errors)}`)
  return validated.value
}

export async function observabilityDashboard(db: Queryable) {
  const [summaryQuery, trendQuery, modelsQuery, runsQuery] = await Promise.all([
    db.query<{ runs: number; successes: number; failures: number; active: number; tokens: number; average_duration_ms: number }>(`SELECT
      COUNT(*)::int AS runs,
      COUNT(*) FILTER (WHERE status='completed')::int AS successes,
      COUNT(*) FILTER (WHERE status IN ('failed','cancelled'))::int AS failures,
      COUNT(*) FILTER (WHERE status='running')::int AS active,
      COALESCE(SUM(input_tokens+output_tokens),0)::bigint AS tokens,
      COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(finished_at,updated_at)-started_at))*1000),0)::float8 AS average_duration_ms
      FROM agent_runs WHERE started_at>=NOW()-INTERVAL '24 hours'`),
    db.query<{ time: Date; runs: number; failures: number }>(`WITH hours AS (
      SELECT generate_series(date_trunc('hour',NOW())-INTERVAL '23 hours',date_trunc('hour',NOW()),INTERVAL '1 hour') AS time
    ) SELECT hours.time,COUNT(r.id)::int AS runs,
      COUNT(r.id) FILTER (WHERE r.status IN ('failed','cancelled'))::int AS failures
      FROM hours LEFT JOIN agent_runs r ON r.started_at>=hours.time AND r.started_at<hours.time+INTERVAL '1 hour'
      GROUP BY hours.time ORDER BY hours.time`),
    db.query<{ model: string; runs: number; tokens: number }>(`SELECT COALESCE(NULLIF(model,''),'未知模型') AS model,COUNT(*)::int AS runs,
      COALESCE(SUM(input_tokens+output_tokens),0)::bigint AS tokens
      FROM agent_runs WHERE started_at>=NOW()-INTERVAL '24 hours'
      GROUP BY 1 ORDER BY tokens DESC,runs DESC LIMIT 8`),
    db.query<{ id: string; agent: string; company: string | null; model: string | null; status: string; timestamp: Date; duration_ms: number; tokens: number; tool_calls: number; summary: string | null; error: string | null }>(`SELECT id,agent_id AS agent,company_id AS company,model,status,started_at AS timestamp,
      EXTRACT(EPOCH FROM (COALESCE(finished_at,updated_at)-started_at))*1000 AS duration_ms,
      input_tokens+output_tokens AS tokens,tool_call_count AS tool_calls,
      LEFT(summary,280) AS summary,LEFT(error,280) AS error
      FROM agent_runs ORDER BY started_at DESC LIMIT 30`),
  ])
  const summary = summaryQuery.rows[0] ?? { runs: 0, successes: 0, failures: 0, active: 0, tokens: 0, average_duration_ms: 0 }
  const successRate = summary.runs ? (Number(summary.successes) / Number(summary.runs)) * 100 : 0
  const runs = runsQuery.rows
  return {
    dashboard,
    observedAt: new Date().toISOString(),
    results: {
      summary: result('summary', [
        { name: 'runs', type: 'number', values: [Number(summary.runs)] },
        { name: 'success_rate', type: 'number', values: [successRate], unit: '%' },
        { name: 'average_duration_ms', type: 'duration', values: [Number(summary.average_duration_ms)], unit: 'ms' },
        { name: 'tokens', type: 'number', values: [Number(summary.tokens)] },
        { name: 'successes', type: 'number', values: [Number(summary.successes)] },
        { name: 'failures', type: 'number', values: [Number(summary.failures)] },
        { name: 'active', type: 'number', values: [Number(summary.active)] },
      ], 1),
      trend: result('trend', [
        { name: 'time', type: 'time', values: trendQuery.rows.map((row) => row.time.toISOString()) },
        { name: 'runs', type: 'number', values: trendQuery.rows.map((row) => Number(row.runs)) },
        { name: 'failures', type: 'number', values: trendQuery.rows.map((row) => Number(row.failures)) },
      ], trendQuery.rows.length),
      models: result('models', [
        { name: 'model', type: 'string', values: modelsQuery.rows.map((row) => row.model) },
        { name: 'runs', type: 'number', values: modelsQuery.rows.map((row) => Number(row.runs)) },
        { name: 'tokens', type: 'number', values: modelsQuery.rows.map((row) => Number(row.tokens)) },
      ], modelsQuery.rows.length),
      recentRuns: result('recent-runs', [
        { name: 'id', type: 'trace', values: runs.map((row) => row.id) },
        { name: 'timestamp', type: 'time', values: runs.map((row) => row.timestamp.toISOString()) },
        { name: 'agent', type: 'string', values: runs.map((row) => row.agent) },
        { name: 'company', type: 'string', values: runs.map((row) => row.company) },
        { name: 'model', type: 'string', values: runs.map((row) => row.model || '未知模型') },
        { name: 'status', type: 'string', values: runs.map((row) => row.status) },
        { name: 'duration_ms', type: 'duration', values: runs.map((row) => Number(row.duration_ms)), unit: 'ms' },
        { name: 'tokens', type: 'number', values: runs.map((row) => Number(row.tokens)) },
        { name: 'tool_calls', type: 'number', values: runs.map((row) => Number(row.tool_calls)) },
        { name: 'summary', type: 'string', values: runs.map((row) => row.summary) },
        { name: 'error', type: 'string', values: runs.map((row) => row.error) },
      ], runs.length),
    },
  }
}
