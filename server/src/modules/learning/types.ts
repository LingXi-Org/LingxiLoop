export type LearningCourseStatus = import('../../domain/public.js').ProjectStatus

export type LearningRole = 'teacher' | 'learner'

export type LearningRoomPurpose = 'study' | 'lab' | 'discussion'

export type CourseMemberChangeOutcome = 'updated' | 'not_found'
