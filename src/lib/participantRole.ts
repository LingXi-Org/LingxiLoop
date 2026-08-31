import type { Participant } from '@/types'

const ROLE_ZH: Record<string, string> = {
  researcher: '研究员',
  designer: '设计师',
  engineer: '工程师',
  'software engineer': '软件工程师',
  developer: '开发工程师',
  'product manager': '产品经理',
  'study coach': '学习教练',
  'learning coach': '学习教练',
  coach: '学习教练',
  'learning coordinator': '学习统筹',
  coordinator: '学习统筹',
  'concept tutor': '概念导师',
  tutor: '学习导师',
  'problem coach': '解题陪练',
  'learning diagnostician': '错因诊断',
  diagnostician: '错因诊断',
  'research guide': '阅读研究',
  'practice mentor': '实践导师',
  'teacher operations': '课程运营',
  'teaching assistant': '教学助教',
  'brand & voice': '品牌策划',
  ops: '运营专员',
  operator: '运营专员',
  architect: '架构师',
  strategist: '策略顾问',
  marketing: '市场专员',
}

/** UI-facing Chinese participant title. Never leaks an English persona title or kind. */
export function participantRoleZh(participant?: Participant): string | null {
  if (!participant) return null
  if (participant.kind === 'human') return '成员'
  const role = participant.role?.trim()
  if (!role) return '智能助教'
  // Learning personas can store both languages for model context. The UI
  // keeps an authored Chinese segment regardless of which side comes first.
  const segments = role.split(/\s*[·|｜]\s*/u).map((segment) => segment.trim()).filter(Boolean)
  const chinese = segments.find((segment) => /^[\u3400-\u9fff]/u.test(segment))
  if (chinese) return chinese
  const normalized = (segments[0] ?? role).toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
  return ROLE_ZH[normalized] ?? '智能助教'
}
