import type { Participant } from '@/types'

const ROLE_ZH: Record<string, string> = {
  researcher: '研究员',
  designer: '设计师',
  engineer: '工程师',
  'software engineer': '软件工程师',
  developer: '开发工程师',
  'product manager': '产品经理',
  'study coach': '学习教练',
  'concept tutor': '概念导师',
  'problem coach': '解题陪练',
  'learning diagnostician': '错因诊断',
  'research guide': '阅读研究',
  'practice mentor': '实践导师',
  'brand & voice': '品牌策划',
  ops: '运营专员',
  operator: '运营专员',
  architect: '架构师',
  strategist: '策略顾问',
  marketing: '市场专员',
}

/** UI-facing Chinese title. Never leaks an English persona title. */
export function participantRoleZh(participant?: Participant): string | null {
  if (!participant || participant.kind !== 'agent') return null
  const role = participant.role?.trim()
  if (!role) return '智能体'
  // Learning personas are stored as "中文 · English" for model context.
  // The product UI intentionally exposes only the authored Chinese title.
  if (/^[\u3400-\u9fff]/u.test(role)) return role.split(/\s*[·|｜]\s*/u, 1)[0]?.trim() || '智能体'
  return ROLE_ZH[role.toLowerCase()] ?? '智能体'
}
