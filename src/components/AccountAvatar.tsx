import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

// The caller supplies an authorized account profile. A URL change remounts
// Radix's image state, including when a previously broken image is replaced.
export function AccountAvatar({ userId, name, url, className }: {
  userId: string; name: string; url?: string | null; className?: string
}) {
  const src = url?.trim() || undefined
  return <Avatar key={`${userId}:${src ?? ''}`} size="sm" className={className} data-user-id={userId}>
    <AvatarImage src={src} alt={`${name}的头像`} />
    <AvatarFallback role="img" aria-label={`${name}未设置头像或头像加载失败`} title="未设置头像或头像加载失败">{name.trim().slice(0, 1) || '?'}</AvatarFallback>
  </Avatar>
}
