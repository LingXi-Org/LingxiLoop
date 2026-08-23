import { ParticipantProfile } from '@/im/Profile'
import { useApp } from '@/stores/app'

/** Desktop adapter for the shared IM participant profile. */
export function InfoPane() {
  const participantId = useApp((state) => state.infoAgentId)
  const close = useApp((state) => state.closeAgentInfo)
  if (!participantId) return null
  return <ParticipantProfile participantId={participantId} onClose={close} variant="desktop" />
}
