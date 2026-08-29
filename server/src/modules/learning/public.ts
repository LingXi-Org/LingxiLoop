/** Public authorization surface for Learning-owned conversations and agents. */
export {
  assertNotManagedPulse,
  assertPulseVisible,
  assertTeacherRoomAccessible,
  isTeacherRoom,
} from './visibility.js'
export { STARTER_ROOMS, STARTER_TEAM, type LearningPersonaKey } from './preset.js'
export { assertTeacherApprovalFresh } from './runtime.js'
