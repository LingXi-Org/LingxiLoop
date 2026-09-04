import type { Queryable } from '../../db/queryable.js'
import { HttpError } from '../../http/errors.js'

export type AdminResourceGroup = 'identity' | 'learning' | 'collaboration' | 'operations'

interface AdminResourceDefinition {
  label: string
  group: AdminResourceGroup
  table: string
  idColumn: string
  companyColumn?: string
  projectColumn?: string
  statusColumn?: string
  searchColumns: readonly string[]
  orderColumn?: string
  listOmit?: readonly string[]
  detailOmit?: readonly string[]
  total?: boolean
  sensitive?: boolean
  detail?: boolean
}

const secretColumns = ['password_hash', 'token_hash', 'lease_token', 'lease_token_hash'] as const

export const ADMIN_RESOURCES = {
  users: { label: '用户', group: 'identity', table: 'users', idColumn: 'id', statusColumn: 'suspended_at', searchColumns: ['id', 'email', 'display_name'], orderColumn: 'created_at', detailOmit: ['password_hash'], total: true },
  companies: { label: '公司', group: 'identity', table: 'companies', idColumn: 'id', companyColumn: 'id', statusColumn: 'status', searchColumns: ['id', 'name', 'slug'], orderColumn: 'created_at', total: true },
  'company-memberships': { label: '公司成员', group: 'identity', table: 'company_memberships', idColumn: 'id', companyColumn: 'company_id', statusColumn: 'status', searchColumns: ['id', 'user_id', 'role'], orderColumn: 'created_at', total: true },
  'company-invitations': { label: '公司邀请', group: 'identity', table: 'company_invitations', idColumn: 'token_hash', companyColumn: 'company_id', searchColumns: ['email', 'role', 'note'], orderColumn: 'created_at', listOmit: ['token_hash'], detailOmit: ['token_hash'], detail: false },
  'organization-units': { label: '组织单元', group: 'identity', table: 'organization_units', idColumn: 'id', companyColumn: 'company_id', statusColumn: 'status', searchColumns: ['id', 'name'], orderColumn: 'created_at', total: true },
  'governance-policies': { label: '治理策略', group: 'identity', table: 'governance_policies', idColumn: 'id', companyColumn: 'company_id', statusColumn: 'kind', searchColumns: ['id', 'kind', 'policy_version'], orderColumn: 'created_at', total: true },
  'education-contracts': { label: '教育合同', group: 'identity', table: 'education_contracts', idColumn: 'id', companyColumn: 'company_id', statusColumn: 'status', searchColumns: ['id', 'plan_id'], orderColumn: 'created_at', total: true },
  'organization-seats': { label: '组织席位', group: 'identity', table: 'organization_seats', idColumn: 'id', companyColumn: 'company_id', statusColumn: 'status', searchColumns: ['id', 'user_id', 'contract_id'], orderColumn: 'assigned_at', total: true },
  subscriptions: { label: '订阅', group: 'identity', table: 'subscriptions', idColumn: 'id', companyColumn: 'company_id', statusColumn: 'status', searchColumns: ['id', 'subscriber_user_id', 'plan_id'], orderColumn: 'created_at', total: true },

  projects: { label: '项目', group: 'learning', table: 'projects', idColumn: 'id', companyColumn: 'company_id', projectColumn: 'id', statusColumn: 'status', searchColumns: ['id', 'name', 'description'], orderColumn: 'created_at', total: true },
  'project-memberships': { label: '项目成员', group: 'learning', table: 'project_memberships', idColumn: 'id', companyColumn: 'company_id', projectColumn: 'project_id', statusColumn: 'status', searchColumns: ['id', 'user_id', 'role'], orderColumn: 'created_at', total: true },
  'project-invitations': { label: '项目邀请', group: 'learning', table: 'project_invitations', idColumn: 'token_hash', companyColumn: 'company_id', projectColumn: 'project_id', searchColumns: ['email', 'note'], orderColumn: 'created_at', listOmit: ['token_hash'], detailOmit: ['token_hash'], detail: false },
  'project-transfers': { label: '项目转移', group: 'learning', table: 'project_transfers', idColumn: 'id', projectColumn: 'project_id', statusColumn: 'status', searchColumns: ['id', 'project_id', 'source_company_id', 'target_company_id'], orderColumn: 'created_at' },
  courses: { label: '课程', group: 'learning', table: 'courses', idColumn: 'id', companyColumn: 'company_id', projectColumn: 'project_id', searchColumns: ['id', 'created_by'], orderColumn: 'created_at', total: true },
  'knowledge-units': { label: '知识单元', group: 'learning', table: 'learning_knowledge_units', idColumn: 'id', companyColumn: 'company_id', projectColumn: 'project_id', statusColumn: 'status', searchColumns: ['id', 'title', 'success_criteria'], orderColumn: 'created_at' },
  'learning-activities': { label: '学习活动', group: 'learning', table: 'learning_activities', idColumn: 'id', companyColumn: 'company_id', projectColumn: 'project_id', statusColumn: 'status', searchColumns: ['id', 'title', 'instructions'], orderColumn: 'created_at', listOmit: ['instructions', 'rubric'] },
  'learning-attempts': { label: '学习尝试', group: 'learning', table: 'learning_attempts', idColumn: 'id', companyColumn: 'company_id', projectColumn: 'project_id', statusColumn: 'status', searchColumns: ['id', 'learner_id', 'activity_id'], orderColumn: 'submitted_at' },
  'learning-missions': { label: '学习任务', group: 'learning', table: 'learning_missions', idColumn: 'id', companyColumn: 'company_id', projectColumn: 'project_id', statusColumn: 'status', searchColumns: ['id', 'goal'], orderColumn: 'created_at' },
  'learning-cases': { label: '学习案例', group: 'learning', table: 'learning_cases', idColumn: 'id', companyColumn: 'company_id', projectColumn: 'project_id', statusColumn: 'status', searchColumns: ['id', 'user_id', 'reason'], orderColumn: 'created_at' },
  'learning-evaluations': { label: '学习评估', group: 'learning', table: 'learning_evaluations', idColumn: 'id', companyColumn: 'company_id', projectColumn: 'project_id', statusColumn: 'status', searchColumns: ['id', 'attempt_id', 'evaluator_id'], orderColumn: 'created_at' },
  'evidence-records': { label: '证据', group: 'learning', table: 'evidence_records', idColumn: 'id', companyColumn: 'company_id', projectColumn: 'project_id', searchColumns: ['id', 'kind'], orderColumn: 'created_at', listOmit: ['data'], sensitive: true },
  'trust-snapshots': { label: '信任快照', group: 'learning', table: 'trust_snapshots', idColumn: 'id', companyColumn: 'company_id', projectColumn: 'project_id', statusColumn: 'audience_level', searchColumns: ['id', 'dataset_release'], orderColumn: 'created_at', listOmit: ['payload', 'signature'], sensitive: true },

  participants: { label: '参与者与 Agent', group: 'collaboration', table: 'participants', idColumn: 'id', companyColumn: 'company_id', statusColumn: 'status', searchColumns: ['id', 'name', 'email', 'role'], orderColumn: 'updated_at', listOmit: ['system_prompt', 'tools'], sensitive: true },
  'agent-runs': { label: 'Agent 运行', group: 'collaboration', table: 'agent_runs', idColumn: 'id', companyColumn: 'company_id', statusColumn: 'status', searchColumns: ['id', 'agent_id', 'summary', 'error'], orderColumn: 'started_at', listOmit: ['trigger', 'input_message_ids'], sensitive: true },
  'agent-work-items': { label: 'Agent 工作项', group: 'collaboration', table: 'agent_work_items', idColumn: 'id', companyColumn: 'company_id', statusColumn: 'status', searchColumns: ['id', 'agent_id', 'reason', 'error'], orderColumn: 'created_at', listOmit: ['lease_token_hash', 'steer_inputs', 'result_text'], detailOmit: ['lease_token_hash'], sensitive: true },
  approvals: { label: '审批', group: 'collaboration', table: 'approvals', idColumn: 'id', companyColumn: 'company_id', statusColumn: 'status', searchColumns: ['id', 'agent_id', 'summary'], orderColumn: 'requested_at', listOmit: ['payload', 'blocked_action', 'remaining_actions', 'result'], sensitive: true },
  'agent-routines': { label: 'Agent 例程', group: 'collaboration', table: 'agent_routines', idColumn: 'id', companyColumn: 'company_id', statusColumn: 'status', searchColumns: ['id', 'agent_id', 'title', 'instructions'], orderColumn: 'created_at', listOmit: ['instructions', 'schedule'] },
  'autonomy-rules': { label: '自主规则', group: 'collaboration', table: 'agent_autonomy_rules', idColumn: 'id', companyColumn: 'company_id', statusColumn: 'mode', searchColumns: ['id', 'agent_id', 'operation', 'scope'], orderColumn: 'created_at' },
  'agent-memories': { label: 'Agent 记忆证据', group: 'collaboration', table: 'agent_memory_evidence', idColumn: 'id', companyColumn: 'company_id', statusColumn: 'status', searchColumns: ['id', 'agent_id', 'learner_id', 'error'], orderColumn: 'created_at', listOmit: ['user_text', 'assistant_text'], sensitive: true },
  conversations: { label: '会话', group: 'collaboration', table: 'conversations', idColumn: 'id', companyColumn: 'company_id', projectColumn: 'project_id', statusColumn: 'kind', searchColumns: ['id', 'title', 'subtitle', 'topic'], orderColumn: 'created_at', sensitive: true },
  'email-messages': { label: '邮件', group: 'collaboration', table: 'email_messages', idColumn: 'message_id', companyColumn: 'company_id', statusColumn: 'transport_status', searchColumns: ['message_id', 'subject', 'from_addr', 'to_addrs'], orderColumn: 'created_at', listOmit: ['body', 'html', 'references_chain', 'bcc_addrs'], sensitive: true },
  documents: { label: '文档', group: 'collaboration', table: 'documents', idColumn: 'id', companyColumn: 'company_id', projectColumn: 'project_id', searchColumns: ['id', 'title', 'created_by'], orderColumn: 'created_at', sensitive: true },
  canvases: { label: '画布', group: 'collaboration', table: 'canvases', idColumn: 'id', companyColumn: 'company_id', projectColumn: 'project_id', statusColumn: 'status', searchColumns: ['id', 'title', 'goal', 'summary'], orderColumn: 'created_at', listOmit: ['goal', 'summary'], sensitive: true },
  presentations: { label: '演示', group: 'collaboration', table: 'presentations', idColumn: 'id', companyColumn: 'company_id', projectColumn: 'project_id', statusColumn: 'status', searchColumns: ['id', 'title', 'request_text'], orderColumn: 'created_at', listOmit: ['request_text', 'source_snapshot', 'outline'], sensitive: true },
  'calendar-events': { label: '日历事件', group: 'collaboration', table: 'calendar_events', idColumn: 'id', companyColumn: 'company_id', projectColumn: 'project_id', statusColumn: 'status', searchColumns: ['id', 'title', 'description'], orderColumn: 'start_at', listOmit: ['agent_prompt'], sensitive: true },
  'notification-deliveries': { label: '通知投递', group: 'collaboration', table: 'notification_deliveries', idColumn: 'id', companyColumn: 'company_id', projectColumn: 'project_id', statusColumn: 'status', searchColumns: ['id', 'recipient_user_id', 'summary', 'error'], orderColumn: 'created_at', detailOmit: ['lease_token'] },
  'knowledge-sources': { label: '知识源', group: 'collaboration', table: 'knowledge_sources', idColumn: 'id', companyColumn: 'company_id', projectColumn: 'project_id', statusColumn: 'status', searchColumns: ['id', 'title', 'kind', 'error'], orderColumn: 'created_at', sensitive: true },
  'knowledge-jobs': { label: '知识任务', group: 'collaboration', table: 'knowledge_source_jobs', idColumn: 'id', statusColumn: 'status', searchColumns: ['id', 'source_id', 'last_error'], orderColumn: 'created_at' },

  'llm-calls': { label: 'LLM 调用', group: 'operations', table: 'llm_calls', idColumn: 'id', companyColumn: 'company_id', statusColumn: 'status', searchColumns: ['id', 'agent_id', 'model', 'purpose', 'error'], orderColumn: 'created_at', listOmit: ['extras'], sensitive: true },
  'tool-calls': { label: '工具调用', group: 'operations', table: 'tool_calls', idColumn: 'id', companyColumn: 'company_id', statusColumn: 'status', searchColumns: ['id', 'agent_id', 'name', 'error'], orderColumn: 'created_at', listOmit: ['args', 'result'], sensitive: true },
  'audit-events': { label: '审计事件', group: 'operations', table: 'audit_events', idColumn: 'id', companyColumn: 'company_id', statusColumn: 'kind', searchColumns: ['id', 'user_id', 'kind'], orderColumn: 'created_at', sensitive: true },
  'webhook-receipts': { label: 'Webhook 收据', group: 'operations', table: 'wukong_webhook_receipts', idColumn: 'event_id', statusColumn: 'event_type', searchColumns: ['event_id', 'event_type', 'error'], orderColumn: 'received_at' },
} as const satisfies Record<string, AdminResourceDefinition>

export type AdminResourceName = keyof typeof ADMIN_RESOURCES

export interface AdminListQuery {
  cursor?: string
  limit?: string
  search?: string
  status?: string
  companyId?: string
  projectId?: string
  sort?: string
}

function definition(name: string): AdminResourceDefinition {
  const value = ADMIN_RESOURCES[name as AdminResourceName]
  if (!value) throw new HttpError(404, 'admin resource not found')
  return value
}

function cursorOffset(cursor: string | undefined): number {
  if (!cursor) return 0
  try {
    const value = Number(Buffer.from(cursor, 'base64url').toString('utf8'))
    if (Number.isInteger(value) && value >= 0 && value <= 1_000_000_000) return value
  } catch { /* handled below */ }
  throw new HttpError(400, 'invalid cursor')
}

function safeLimit(raw: string | undefined): number {
  const value = raw ? Number(raw) : 50
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new HttpError(400, 'limit must be an integer between 1 and 100')
  }
  return value
}

function omitColumns(value: readonly string[] | undefined): string[] {
  return [...new Set([...secretColumns, ...(value ?? [])])]
}

export async function listAdminResources(
  db: Queryable,
  resourceName: string,
  query: AdminListQuery,
): Promise<{ data: Record<string, unknown>[]; nextCursor: string | null; total?: number }> {
  const resource = definition(resourceName)
  const limit = safeLimit(query.limit)
  const offset = cursorOffset(query.cursor)
  if (query.search && query.search.trim().length > 200) throw new HttpError(400, 'search is too long')
  if (query.status && !resource.statusColumn) throw new HttpError(400, 'status filter is not available')
  if (query.companyId && !resource.companyColumn) throw new HttpError(400, 'company filter is not available')
  if (query.projectId && !resource.projectColumn) throw new HttpError(400, 'project filter is not available')
  const values: unknown[] = []
  const where: string[] = []
  const add = (value: unknown): string => { values.push(value); return `$${values.length}` }

  if (query.search?.trim()) {
    const parameter = add(`%${query.search.trim()}%`)
    where.push(`(${resource.searchColumns.map((column) => `COALESCE(item.${column}::text,'') ILIKE ${parameter}`).join(' OR ')})`)
  }
  if (query.status?.trim() && resource.statusColumn) where.push(`item.${resource.statusColumn}::text=${add(query.status.trim())}`)
  if (query.companyId?.trim() && resource.companyColumn) where.push(`item.${resource.companyColumn}=${add(query.companyId.trim())}`)
  if (query.projectId?.trim() && resource.projectColumn) where.push(`item.${resource.projectColumn}=${add(query.projectId.trim())}`)

  const predicate = where.length ? ` WHERE ${where.join(' AND ')}` : ''
  const orderColumn = resource.orderColumn ?? resource.idColumn
  const ascending = query.sort === 'oldest' || query.sort === 'id'
  if (query.sort && !['newest', 'oldest', 'id'].includes(query.sort)) throw new HttpError(400, 'invalid sort')
  const order = query.sort === 'id' ? resource.idColumn : orderColumn
  const direction = ascending ? 'ASC' : 'DESC'
  const omit = add(omitColumns(resource.listOmit))
  const rowLimit = add(limit + 1)
  const rowOffset = add(offset)
  const id = resource.idColumn
  const result = await db.query<{ data: Record<string, unknown> }>(
    `SELECT (to_jsonb(item)-${omit}::text[]) || jsonb_build_object('id',
              CASE WHEN ${add(Boolean(resource.listOmit?.includes(id)))} THEN md5(item.${id}::text) ELSE item.${id}::text END) AS data
       FROM ${resource.table} item${predicate}
      ORDER BY item.${order} ${direction},item.${id} ${direction}
      LIMIT ${rowLimit} OFFSET ${rowOffset}`,
    values,
  )
  const hasMore = result.rows.length > limit
  const data = result.rows.slice(0, limit).map((row) => row.data)
  const response: { data: Record<string, unknown>[]; nextCursor: string | null; total?: number } = {
    data,
    nextCursor: hasMore ? Buffer.from(String(offset + limit)).toString('base64url') : null,
  }
  if (resource.total) {
    const totalValues = values.slice(0, values.length - 4)
    const count = await db.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM ${resource.table} item${predicate}`,
      totalValues,
    )
    response.total = count.rows[0]?.total ?? 0
  }
  return response
}

export async function getAdminResource(
  db: Queryable,
  resourceName: string,
  id: string,
): Promise<{ data: Record<string, unknown>; sensitive: boolean } | null> {
  const resource = definition(resourceName)
  if (resource.detail === false) throw new HttpError(404, 'resource detail is not available')
  const result = await db.query<{ data: Record<string, unknown> }>(
    `SELECT (to_jsonb(item)-$2::text[]) || jsonb_build_object('id',item.${resource.idColumn}::text) AS data
       FROM ${resource.table} item WHERE item.${resource.idColumn}::text=$1 LIMIT 1`,
    [id, omitColumns(resource.detailOmit)],
  )
  return result.rows[0] ? { data: result.rows[0].data, sensitive: Boolean(resource.sensitive) } : null
}

export async function getAdminResourceField(
  db: Queryable,
  resourceName: string,
  id: string,
  field: string,
): Promise<unknown | undefined> {
  const resource = definition(resourceName)
  if (resource.detail === false || !/^[a-z_][a-z0-9_]*$/.test(field)
    || (secretColumns as readonly string[]).includes(field)) {
    throw new HttpError(404, 'resource field is not available')
  }
  const result = await db.query<{ value: unknown }>(
    `SELECT to_jsonb(item)->$2 AS value FROM ${resource.table} item WHERE item.${resource.idColumn}::text=$1 LIMIT 1`,
    [id, field],
  )
  return result.rows[0]?.value
}

export function adminResourceCatalog() {
  return Object.entries(ADMIN_RESOURCES).map(([name, value]) => {
    const resource: AdminResourceDefinition = value
    return {
      name,
      label: resource.label,
      group: resource.group,
      detail: resource.detail !== false,
      sensitive: Boolean(resource.sensitive),
    }
  })
}
