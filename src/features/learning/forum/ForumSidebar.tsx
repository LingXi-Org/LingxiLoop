import type { ForumFilter } from './contracts'

export type ForumSection = ForumFilter

/** Forum boards, listed under 论坛 in the course nested sidebar. */
export const forumSections = [
  { kind: 'all', label: '全部内容' },
  { kind: 'assignment', label: '作业' },
  { kind: 'share', label: '自由讨论' },
] satisfies Array<{ kind: ForumSection; label: string }>
