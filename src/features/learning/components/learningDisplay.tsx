import { Badge } from '@/components/ui/badge'

export type LearningSection =
  | 'today'
  | 'objectives'
  | 'activities'
  | 'evidence'
  | 'reviews'
  | 'notifications'

const STATUS_LABELS: Record<string, string> = {
  CREATED: '已创建', DRAFT: '草稿', ACTIVE: '进行中', COURSE_ENDED: '已结课', READ_ONLY: '只读',
  TRANSFER_PENDING: '转移中', RETENTION: '保留期', ARCHIVED: '已归档', DELETED: '已删除',
  OPEN: '待开始', IN_PROGRESS: '进行中', COMPLETED: '已完成', CANCELLED: '已取消', PENDING: '待审核',
  ACCEPTED: '已采纳', REJECTED: '已退回', VERIFIED: '已验证', LEARNING: '学习中', NEEDS_REVIEW: '待复核',
  SENT: '已送达', SENDING: '发送中', FAILED: '投递失败',
  PAUSED: '已暂停', CLOSED: '已关闭', SUPPORTED: '证据支持', INCONCLUSIVE: '待确认',
}

export const MISSION_KIND_LABELS: Record<string, string> = {
  STUDY: '持续学习', PROJECT: '迁移项目', RESEARCH: '资料研读', REVIEW: '复习巩固',
}

export const STEP_TYPE_LABELS: Record<string, string> = {
  LEARN: '理解', PRACTICE: '练习', CHECK: '检查', REFLECT: '反思',
}

export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  LESSON: '课程讲解', PRACTICE: '练习', ASSESSMENT: '考核', PROJECT: '项目', REVIEW: '复习',
}

export const EVALUATION_MODE_LABELS: Record<string, string> = {
  AGENT_FORMATIVE: '智能助教形成性评价', TEACHER_REQUIRED: '课程创建者审核',
}

export const WEEKDAY_LABELS: Record<string, string> = {
  monday: '周一', tuesday: '周二', wednesday: '周三', thursday: '周四', friday: '周五',
  saturday: '周六', sunday: '周日',
}

export const ASSISTANCE_LABELS: Record<string, string> = {
  NONE: '独立完成', HINT: '使用提示', GUIDED: '引导下完成',
}

export const DELIVERY_CHANNEL_LABELS: Record<string, string> = {
  IN_APP: '应用内', EMAIL: '邮件',
}

export function statusLabel(value: unknown): string {
  const raw = String(value ?? '—')
  return STATUS_LABELS[raw.toUpperCase()] ?? '状态待同步'
}

export function MasteryBadge({ level }: { level: number }) {
  const labels = ['尚无证据', '识别 / 回忆', '提示下完成', '独立完成', '迁移应用']
  return <Badge variant="secondary">掌握等级 {level} · {labels[level] ?? labels[0]}</Badge>
}
