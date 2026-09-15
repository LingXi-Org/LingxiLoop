import { ADMIN_RESOURCES } from './resources'

export const WORKSPACES = [
  { path: '/', label: '总览', description: '平台动态与需要关注的事项' },
  { path: '/users', label: '用户', description: '了解用户状态与组织归属', resource: 'users' },
  { path: '/organizations', label: '组织', description: '团队、成员与教育服务', resource: 'companies' },
  { path: '/projects', label: '项目', description: '学习进展与协作空间', resource: 'projects' },
  { path: '/ai', label: 'AI 与运行', description: '运行表现、用量与异常处理' },
  { path: '/system', label: '系统管理', description: '服务健康、安全与审计' },
] as const

export const LEARNING = ['courses', 'knowledge-units', 'learning-activities', 'learning-missions', 'learning-attempts', 'learning-cases', 'learning-evaluations', 'evidence-records', 'trust-snapshots']
export const CONTENT = ['conversations', 'documents', 'canvases', 'presentations', 'calendar-events']
export const AI = ['participants', 'agent-routines', 'agent-runs', 'agent-deliveries', 'llm-calls']
export const SYSTEM = ['audit-events', 'webhook-receipts', 'notification-deliveries']

export function resourceArea(resource: string): string {
  if (resource === 'users' || resource === 'subscriptions') return '/users'
  if (AI.includes(resource)) return '/ai'
  if (SYSTEM.includes(resource)) return '/system'
  if (resource === 'email-messages' || ADMIN_RESOURCES.find(item => item.name === resource)?.group === 'identity') return '/organizations'
  return '/projects'
}

export function recordPath(resource: string, id?: string): string {
  const area = resourceArea(resource)
  if (!id && ['users', 'companies', 'projects'].includes(resource)) return area
  return `${area}/${resource}${id ? `/${encodeURIComponent(id)}` : ''}`
}

export function relationGroups(resource: string): Record<string, string[]> {
  if (resource === 'users') return { '组织与项目': ['company-memberships', 'project-memberships'], '订阅': ['subscriptions'] }
  if (resource === 'companies') return {
    '成员与组织': ['company-memberships', 'company-invitations', 'organization-units'],
    '合同与治理': ['education-contracts', 'organization-seats', 'governance-policies'],
    '项目': ['projects'], '协作内容': [...CONTENT, 'email-messages'],
    'AI': ['participants', 'agent-routines', 'agent-runs'], '知识处理': ['knowledge-sources', 'knowledge-jobs'],
  }
  if (resource === 'projects') return {
    '成员与转移': ['project-memberships', 'project-invitations', 'project-transfers'],
    '学习': LEARNING, '协作内容': CONTENT, '知识处理': ['knowledge-sources', 'knowledge-jobs'],
  }
  if (resource === 'knowledge-sources') return { '处理任务': ['knowledge-jobs'] }
  if (resource === 'learning-activities') return { '学习尝试': ['learning-attempts'] }
  if (resource === 'learning-attempts') return { '评估': ['learning-evaluations'] }
  return {}
}

export function relationFilter(resource: string, id: string): Record<string, string> {
  const key = ({ users: 'userId', companies: 'companyId', projects: 'projectId', 'knowledge-sources': 'sourceId', 'learning-activities': 'activityId', 'learning-attempts': 'attemptId' } as Record<string, string>)[resource]
  return key ? { [key]: id } : {}
}

export function listParameters(parameters: URLSearchParams, scope: Record<string, string> = {}) {
  const result = new URLSearchParams()
  for (const key of ['search', 'status', 'companyId', 'projectId', 'userId', 'sourceId', 'activityId', 'attemptId', 'sort', 'limit', 'cursor', 'period']) {
    const value = parameters.get(key)
    if (value) result.set(key, value)
  }
  for (const [key, value] of Object.entries(scope)) result.set(key, value)
  return result
}
