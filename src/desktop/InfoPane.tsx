import { ParticipantProfile } from '@/im/Profile'
import { useSurface } from '@/stores/surface'

/** Desktop adapter for the shared IM participant profile. */
export function InfoPane() {
  const participantId = useSurface((state) => state.surface?.kind === 'member' ? state.surface.participantId : null)
  const close = useSurface((state) => state.closeAgentInfo)
  if (!participantId) return null
  return <ParticipantProfile participantId={participantId} onClose={close} />
}
