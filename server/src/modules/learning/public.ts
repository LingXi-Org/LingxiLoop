/** Public authorization surface for Learning-owned conversations and agents. */

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
