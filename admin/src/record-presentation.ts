export type AdminRecord = Record<string, unknown> & { id: string }

export const FIELD_LABELS: Record<string, string> = {
  seat_limit: '席位上限', ends_at: '结束时间', current_period_end: '订阅到期', failed_at: '失败时间', channel: '投递渠道', executionMs: '执行耗时', costMicros: '费用（微单位）', createdAt: '创建时间',
  id: '记录编号', name: '名称', title: '标题', display_name: '姓名', email: '邮箱', subject: '主题',
  status: '状态', role: '角色', kind: '类型', type: '类型', description: '描述', summary: '摘要',
  created_at: '创建时间', updated_at: '更新时间', deleted_at: '删除时间', suspended_at: '停用时间',
  started_at: '开始时间', finished_at: '完成时间', ended_at: '结束时间', completed_at: '完成时间',
  submitted_at: '提交时间', requested_at: '申请时间', assigned_at: '分配时间', received_at: '接收时间',
  expires_at: '到期时间', start_at: '开始时间', end_at: '结束时间', company_id: '所属公司', project_id: '所属项目',
  user_id: '用户', agent_id: 'Agent', created_by: '创建者', owner_id: '所有者', learner_id: '学习者',
  avatar: '头像', avatar_url: '头像', image: '图片', cover: '封面', cover_url: '封面', logo_url: '标志',
  model: '模型', purpose: '用途', provider: '提供方', tokens: 'Token 用量', input_tokens: '输入 Token',
  output_tokens: '输出 Token', total_tokens: '总 Token', duration_ms: '耗时', error: '错误信息', last_error: '最近错误',
  plan_id: '方案', contract_id: '合同', subscriber_user_id: '订阅用户', policy_version: '策略版本',
  slug: '标识', note: '备注', reason: '原因', goal: '目标', topic: '主题', subtitle: '副标题',
  content: '正文', body: '正文', text: '文本', html: 'HTML 正文', data: '数据', metadata: '附加信息',
  detail: '详细信息', payload: '附加内容', config: '配置', settings: '设置', result: '结果',
  transport_status: '投递状态', from_addr: '发件人', to_addrs: '收件人', message_id: '消息编号',
  event_id: '事件编号', event_type: '事件类型', operation: '操作', scope: '范围', mode: '模式',
  source_id: '知识源', source_company_id: '转出公司', target_company_id: '转入公司',
  recipient_user_id: '接收用户', activity_id: '学习活动', attempt_id: '学习尝试', evaluator_id: '评估者',
  success_criteria: '达成标准', instructions: '说明', rubric: '评分标准', score: '得分',
  audience_level: '受众级别', dataset_release: '数据集版本', enabled: '启用', email_verified: '邮箱已验证',
  is_active: '当前有效', version: '版本', size: '大小', url: '链接', count: '数量',
  email_verified_at: '邮箱验证时间', last_login_at: '最近登录', suspension_reason: '停用原因', suspended_by: '停用操作者',
  personal_owner_user_id: '个人空间所有者', study_room_conversation_id: '学习室', avatar_bg: '头像底色',
  messageId: '消息编号', messageSeq: '消息序号', clientMsgNo: '客户端编号', channelId: '会话',
  fromUid: '发送者', timestamp: '发送时间', refs: '关联资源', attachment: '附件',
}

export function fieldLabel(key: string): string { return FIELD_LABELS[key] ?? key.replaceAll('_', ' ') }

export function recordTitle(record: AdminRecord): string {
  for (const key of ['display_name', 'name', 'title', 'email', 'subject', 'summary', 'goal', 'model', 'kind', 'user_id_label', 'project_id_label', 'source_id_label']) {
    if (typeof record[key] === 'string' && record[key]) return String(record[key])
  }
  return record.id
}

export const STATUS_LABELS: Record<string, string> = {
  teacher: '教师', student: '学生', processing: '处理中', sending: '发送中', leased: '执行中', waiting: '等待中', partial: '部分完成', blocked: '受阻',
  active: '有效', ready: '已就绪', healthy: '健康', completed: '已完成', success: '成功', succeeded: '成功',
  approved: '已批准', delivered: '已送达', sent: '已发送', verified: '已验证', triggered: '已触发',
  failed: '失败', error: '错误', unhealthy: '异常', down: '离线', 'crash-looping': '反复崩溃',
  suspended: '已停用', rejected: '已拒绝', deleted: '已删除', revoked: '已撤销',
  running: '运行中', pending: '待处理', queued: '排队中', building: '构建中', deploying: '部署中',
  action_required: '需要处理', paused: '已暂停', draft: '草稿', invited: '已邀请',
  archived: '已归档', ended: '已结束', cancelled: '已取消', canceled: '已取消', expired: '已过期',
  read_only: '只读', unknown: '未知', admin: '管理员', owner: '所有者', member: '成员',
  user: '用户', agent: 'Agent', human: '成员', viewer: '查看者', editor: '编辑者',
  trial: '试用中', grace_period: '宽限期', offboarded: '已退出', retention: '保留期',
  user_deletion_pending: '等待账号删除', created: '已创建', course_ended: '课程结束', transfer_pending: '等待转移',
  personal: '个人空间', education: '教育组织', personal_learning: '个人学习', teaching: '教学', institutional_course: '机构课程',
}

export function statusTone(value: unknown): 'success' | 'danger' | 'warning' | 'neutral' {
  const status = String(value ?? '').toLowerCase()
  if (['active', 'ready', 'healthy', 'completed', 'success', 'succeeded', 'approved', 'delivered', 'sent', 'verified'].includes(status)) return 'success'
  if (['failed', 'error', 'unhealthy', 'down', 'crash-looping', 'suspended', 'rejected'].includes(status)) return 'danger'
  if (['running', 'pending', 'queued', 'building', 'deploying', 'action_required', 'paused'].includes(status)) return 'warning'
  return 'neutral'
}

export function formatValue(value: unknown, key = ''): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (/(?:_at|At)$/.test(key) && (typeof value === 'string' || typeof value === 'number')) {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return date.toLocaleString('zh-CN', { hour12: false })
  }
  if (typeof value === 'number') return `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 }).format(value)}${key.endsWith('_ms') ? ' ms' : ''}`
  if (typeof value === 'object') return Array.isArray(value) ? `${value.length} 项内容` : `${Object.keys(value).length} 项属性`
  return String(value)
}

export function safeImageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  if (/[\\\u0000-\u0020]/.test(value)) return undefined
  if (/^\/(?!\/)/.test(value)) return value
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? value : undefined } catch { return undefined }
}

export const IMAGE_FIELDS = ['avatar_url', 'avatar', 'image', 'logo_url', 'cover_url', 'cover', 'thumbnail_url']
export function recordImage(record: AdminRecord): string | undefined {
  return IMAGE_FIELDS.map((key) => safeImageUrl(record[key])).find(Boolean)
}

// Explicit priorities keep content, credentials and large payloads out of directory columns.
const RESOURCE_COLUMNS: Record<string, string[]> = {
  users: ['email', 'status', 'last_login_at', 'created_at'],
  'company-memberships': ['user_id', 'company_id', 'role', 'status'],
  'project-memberships': ['user_id', 'project_id', 'role', 'status'],
  'company-invitations': ['email', 'role', 'expires_at', 'created_at'],
  'project-invitations': ['email', 'expires_at', 'created_at'],
  'organization-units': ['company_id', 'status', 'created_at'],
  'governance-policies': ['kind', 'policy_version', 'created_at'],
  'education-contracts': ['plan_id', 'status', 'seat_limit', 'ends_at'],
  'organization-seats': ['user_id', 'status', 'assigned_at'],
  subscriptions: ['plan_id', 'status', 'current_period_end'],
  'project-transfers': ['source_company_id', 'target_company_id', 'status', 'created_at'],
  courses: ['company_id', 'project_id', 'created_at'],
  'knowledge-units': ['status', 'project_id', 'created_at'],
  'learning-activities': ['status', 'project_id', 'created_at'],
  'learning-missions': ['status', 'project_id', 'created_at'],
  'learning-cases': ['user_id', 'status', 'created_at'],
  'evidence-records': ['kind', 'project_id', 'created_at'],
  'trust-snapshots': ['audience_level', 'dataset_release', 'created_at'],
  participants: ['kind', 'company_id', 'status', 'updated_at'],
  'agent-routines': ['agent_id', 'status', 'created_at'],
  'agent-deliveries': ['channel', 'company_id', 'error', 'failed_at'],
  conversations: ['kind', 'company_id', 'project_id', 'created_at'],
  documents: ['company_id', 'project_id', 'updated_at'],
  canvases: ['status', 'project_id', 'created_at'],
  presentations: ['status', 'project_id', 'created_at'],
  'notification-deliveries': ['status', 'recipient_user_id', 'error', 'created_at'],
  'knowledge-sources': ['kind', 'status', 'project_id', 'created_at'],
  'knowledge-jobs': ['source_id', 'status', 'last_error', 'created_at'],
  'audit-events': ['kind', 'user_id', 'company_id', 'created_at'],
  'webhook-receipts': ['event_type', 'error', 'received_at'],
  companies: ['type', 'status', 'plan_id', 'created_at'],
  projects: ['kind', 'status', 'company_id', 'created_at'],
  'llm-calls': ['status', 'input_tokens', 'output_tokens', 'duration_ms', 'created_at'],
  'agent-runs': ['status', 'tokens', 'executionMs', 'costMicros', 'createdAt'],
  'learning-attempts': ['status', 'learner_id', 'activity_id', 'submitted_at'],
  'learning-evaluations': ['status', 'attempt_id', 'evaluator_id', 'created_at'],
  'email-messages': ['from_addr', 'transport_status', 'created_at'],
  'calendar-events': ['status', 'start_at', 'end_at', 'project_id'],
}

export function recordColumns(_rows: AdminRecord[], resource = ''): string[] {
  return RESOURCE_COLUMNS[resource] ?? ['status', 'company_id', 'project_id', 'created_at']
}

export function accountStatus(record: AdminRecord): string {
  return record.deleted_at ? 'deleted' : record.suspended_at ? 'suspended' : 'active'
}

export function resourceContentPath(value: string): string | undefined {
  return /^\/admin\/resources\/[^/?#]+\/[^/?#]+\/content\/[^/?#]+$/.test(value)
    ? value.replace(/^\/admin\//, '/control/platform/') : undefined
}
