import { Badge } from '@/components/ui/badge'

export type LearningSection =
  | 'today'
  | 'objectives'
  | 'activities'
  | 'evidence'
  | 'reviews'
  | 'notifications'

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿', active: '进行中', published: '已发布', closed: '已关闭', archived: '已归档',
  CREATED: '已创建', DRAFT: '草稿', ACTIVE: '进行中', COURSE_ENDED: '已结课', READ_ONLY: '只读',
  TRANSFER_PENDING: '转移中', RETENTION: '保留期', ARCHIVED: '已归档', DELETED: '已删除',
  open: '待开始', in_progress: '进行中', completed: '已完成', cancelled: '已取消', pending: '待审核',
  accepted: '已采纳', rejected: '已退回', verified: '已验证', learning: '学习中', needs_review: '待复核',
  sent: '已送达', failed: '投递失败',
}

export const MISSION_KIND_LABELS: Record<string, string> = {
  study: '持续学习', project: '迁移项目', research: '资料研读', review: '复习巩固',
}

export const STEP_TYPE_LABELS: Record<string, string> = {
  learn: '理解', practice: '练习', check: '检查', reflect: '反思',
}

export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  lesson: '课程讲解', practice: '练习', assessment: '考核', project: '项目', review: '复习',
}

export const EVALUATION_MODE_LABELS: Record<string, string> = {
  agent_formative: '智能体形成性评价', teacher_required: '教师审核',
}

export const WEEKDAY_LABELS: Record<string, string> = {
  monday: '周一', tuesday: '周二', wednesday: '周三', thursday: '周四', friday: '周五',
  saturday: '周六', sunday: '周日',
}

export const ASSISTANCE_LABELS: Record<string, string> = {
  none: '独立完成', hint: '使用提示', guided: '引导下完成',
}

export const DELIVERY_CHANNEL_LABELS: Record<string, string> = {
  in_app: '应用内', email: '邮件',
}

export function statusLabel(value: unknown): string {
  const raw = String(value ?? '—')
  return STATUS_LABELS[raw] ?? raw
}

export function MasteryBadge({ level }: { level: number }) {
  const labels = ['尚无证据', '识别 / 回忆', '提示下完成', '独立完成', '迁移应用']
  return <Badge variant="secondary">L{level} · {labels[level] ?? labels[0]}</Badge>
}
