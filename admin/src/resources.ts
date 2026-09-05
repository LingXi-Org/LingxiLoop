export type ResourceGroup = 'identity' | 'learning' | 'collaboration' | 'operations'

export interface AdminResource {
  name: string
  label: string
  group: ResourceGroup
  detail?: boolean
}

export const GROUP_LABELS: Record<ResourceGroup, string> = {
  identity: '身份与组织',
  learning: '学习业务',
  collaboration: 'Agent 与协作',
  operations: '运维与审计',
}

const identity = [
  ['users', '用户'], ['companies', '公司'], ['company-memberships', '公司成员'],
  ['company-invitations', '公司邀请'], ['organization-units', '组织单元'],
  ['governance-policies', '治理策略'], ['education-contracts', '教育合同'],
  ['organization-seats', '组织席位'], ['subscriptions', '订阅'],
] as const
const learning = [
  ['projects', '项目'], ['project-memberships', '项目成员'], ['project-invitations', '项目邀请'],
  ['project-transfers', '项目转移'], ['courses', '课程'], ['knowledge-units', '知识单元'],
  ['learning-activities', '学习活动'], ['learning-attempts', '学习尝试'],
  ['learning-missions', '学习任务'], ['learning-cases', '学习案例'],
  ['learning-evaluations', '学习评估'], ['evidence-records', '证据'], ['trust-snapshots', '信任快照'],
] as const
const collaboration = [
  ['participants', '参与者与 Agent'], ['agent-runs', 'Agent 运行'], ['agent-work-items', 'Agent 工作项'],
  ['approvals', '审批'], ['agent-routines', 'Agent 例程'], ['autonomy-rules', '自主规则'],
  ['agent-memories', 'Agent 记忆证据'], ['conversations', '会话'], ['email-messages', '邮件'],
  ['documents', '文档'], ['canvases', '画布'], ['presentations', '演示'],
  ['calendar-events', '日历事件'], ['notification-deliveries', '通知投递'],
  ['knowledge-sources', '知识源'], ['knowledge-jobs', '知识任务'],
] as const
const operations = [
  ['llm-calls', 'LLM 调用'], ['tool-calls', '工具调用'], ['audit-events', '审计事件'],
  ['webhook-receipts', 'Webhook 收据'],
] as const

export const ADMIN_RESOURCES: AdminResource[] = [
  ...identity.map(([name, label]) => ({ name, label, group: 'identity' as const, detail: !name.endsWith('invitations') })),
  ...learning.map(([name, label]) => ({ name, label, group: 'learning' as const, detail: !name.endsWith('invitations') })),
  ...collaboration.map(([name, label]) => ({ name, label, group: 'collaboration' as const })),
  ...operations.map(([name, label]) => ({ name, label, group: 'operations' as const })),
]

export function resourceDefinition(name: string | undefined): AdminResource | undefined {
  return ADMIN_RESOURCES.find((resource) => resource.name === name)
}
