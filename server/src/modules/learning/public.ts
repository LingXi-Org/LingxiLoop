/** Public authorization surface for Learning-owned conversations and agents. */
export { learningTools } from './agent-tools.js'
export { teacherTools } from './teacher-agent-tools.js'
export { canReadLearningFile } from './submission-attachments.js'

export { type LearningPersonaKey, STARTER_ROOMS, STARTER_TEAM } from './preset.js'
export { projectLifecycleProjection } from './project-lifecycle-projection.js'
export {
  assertTeacherApprovalFresh,
  describeTeacherAction,
  loadLearningTurnContext,
  loadTeacherTurnContext,
} from './runtime.js'
export {
  assertNotManagedPulse,
  assertPulseVisible,
  assertTeacherRoomAccessible,
  isTeacherRoom,
} from './visibility.js'
