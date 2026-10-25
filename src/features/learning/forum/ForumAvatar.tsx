import { AccountAvatar } from '@/components/AccountAvatar'
import { useParticipants } from '@/features/agents/state'
import { useAuth } from '@/stores/auth'

// Use the saved account URL, including explicitly chosen profile artwork.
// A missing/broken image uses the same initial placeholder as other account UI.
export function ForumAvatar({ userId, name, url }: { userId: string; name: string; url?: string | null }) {
  const self = useAuth(state => state.user?.id === userId ? state.user : null)
  // The shared roster refreshes human profiles in the background and after a
  // profile save. Historical authors need not remain in that roster, so keep
  // the authorized forum response as the fallback for those accounts.
  const participant = useParticipants(state => state.byId[userId])
  const src = (self ? self.avatarUrl : participant?.kind === 'human' ? participant.avatarUrl ?? url : url)?.trim() || undefined
  return <AccountAvatar userId={userId} name={name} url={src} className="mt-1" />
}
