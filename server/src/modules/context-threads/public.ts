import {
  contextThreadsApplication,
  openDefaultLearningContextThread,
  seedMemberLearningContextThreads,
} from './facade.js'

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
