import type { LearningSpace } from '@/features/learning/contracts'

export interface LearningSpaceScopes {
  personal: LearningSpace | null
  courses: LearningSpace[]
  visible: LearningSpace[]
}

export function getLearningSpaceScopes(spaces: LearningSpace[]): LearningSpaceScopes {
  const visible = spaces.filter((space) => space.status !== 'ARCHIVED' && space.status !== 'DELETED')
  const personal = visible.find((space) => space.projectKind === 'PERSONAL_LEARNING' && space.isDefault)
    ?? visible.find((space) => space.projectKind === 'PERSONAL_LEARNING')
    ?? null
  return {
    personal,
    courses: visible.filter((space) => space.projectId !== personal?.projectId),
    visible,
  }
}
