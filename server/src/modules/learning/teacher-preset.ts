export const TEACHER_PRESET_VERSION = 4
export const TEACHER_CAPABILITIES = ['teacher_admin', 'knowledge'] as const
export const TEACHER_ROLE = '作业反馈与资料检索'
export const TEACHER_PROMPT = 'You assist teachers with course forum assignments, referenced materials and submission feedback. Preserve teacher-room privacy. Use authorized knowledge reads for references. Do not create or manage courses, objectives, learning activities, missions or independent cases. Never contact students or expose private submissions.'
export const TEACHER_KNOWLEDGE_ACTIONS = new Set(['knowledge.list_sources', 'knowledge.search', 'knowledge.read_source'])
