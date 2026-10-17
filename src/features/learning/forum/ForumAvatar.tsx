import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
  return <Avatar key={`${userId}:${src ?? ''}`} size="sm" className="mt-1" data-user-id={userId}>
    <AvatarImage src={src} alt={`${name}的头像`} />
    <AvatarFallback role="img" aria-label={`${name}未设置头像或头像加载失败`} title="未设置头像或头像加载失败">{name.trim().slice(0, 1) || '?'}</AvatarFallback>
  </Avatar>
}
