import { ParticipantProfile } from '@/im/Profile'
import { useApp } from '@/stores/app'

/** Mobile navigation adapter. Swipe-back remains owned by MobileApp; the
 * profile itself is shared with web and desktop. */
export function MobileParticipantInfo() {
  const participantId = useApp((state) => state.infoAgentId)
  const close = useApp((state) => state.closeAgentInfo)
  if (!participantId) return null
  return <ParticipantProfile participantId={participantId} onClose={close} variant="mobile" />
}
