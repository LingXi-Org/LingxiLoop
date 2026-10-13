import {
  contextThreadsApplication,
  openDefaultLearningContextThread,
  seedMemberLearningContextThreads,
} from './facade.js'
import type { ContextThreadScope } from './contracts.js'

export function createHomeworkThread(
  scope: ContextThreadScope,
  input: { homeworkId: string; agentId: string },
) {
  return contextThreadsApplication.createHomeworkThread(scope, input)
}

export function openLearningContextThread(args: {
  companyId: string
  projectId: string
  userId: string
  agentId: string
}) {
  return contextThreadsApplication.createLearningThread(args, args.agentId)
}

export { openDefaultLearningContextThread, seedMemberLearningContextThreads }
export { bindTeacherOperationsContextThread } from './teacher-operations.js'
export { findTeacherOperationsContextForTeacher } from './repository.js'
