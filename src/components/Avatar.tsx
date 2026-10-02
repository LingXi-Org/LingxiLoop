import type { CSSProperties } from 'react'
import { AVATAR_IMG_LOADING, useAvatarImg, useCachedAvatarSrc } from '@/lib/avatarCache'
import { cn } from '@/lib/utils'
import { resolveUserAvatarUrl } from '@/lib/userAvatar'
import { useAuth } from '@/stores/auth'
import type { Participant } from '@/types'
import { BloubAvatar } from './BloubAvatar'

interface Props {
  p: Participant
  size?: number
  statusOverride?: string
  ringColor?: string
  className?: string
  /** Disable continuous motion for dense composite surfaces. */
  animated?: boolean
  /** Opt into live agent states on conversation-facing chat surfaces. */
  mode?: 'chat' | 'neutral'
}

function useResolvedAvatarStatus(p: Participant, statusOverride?: string) {
  // From your own perspective you're definitionally online — the app is
  // on your screen right now. The server-side status comes from real WS
  // presence and races the boot/reconnect flow (setStatus(avail) is fired
  // un-awaited just before the WS 'hello', so the refresh-on-hello can
  // read a stale 'resting' row), leaving you frozen offline-to-yourself.
  // Override the dot for the auth user's own avatar instead of trying to
  // win that race — other people still see the real server-driven state.
  const selfId = useAuth((s) => s.user?.id)
  const ownStatus = p.id === selfId && p.kind === 'human' ? 'avail' : p.status
  return statusOverride ?? ownStatus
}

export function Avatar({ p, size = 44, statusOverride, ringColor = 'var(--paper)', className, animated = true, mode = 'neutral' }: Props) {
  const fontSize = Math.round(size * 0.36)
  const status = useResolvedAvatarStatus(p, statusOverride)
  const agentUrl = p.personalAvatar && 'url' in p.personalAvatar ? p.personalAvatar.url : null
  const humanSrc = useCachedAvatarSrc(p.id, p.kind === 'agent' ? null : resolveUserAvatarUrl(p.avatarUrl, p.id))
  const cachedSrc = p.kind === 'agent' ? agentUrl : humanSrc
  // Bounded retry so one transient load failure doesn't permanently fall
  // back to the initial letter (see useAvatarImg).
  const { showImg, imgKey, onError } = useAvatarImg(cachedSrc)
  const style: CSSProperties = {
    width: size,
    height: size,
    background: p.kind === 'agent' || showImg ? 'transparent' : p.avatarBg,
    fontSize,
  }

  return (
    <div className={cn('relative inline-grid place-items-center rounded-full font-display font-medium text-white tracking-tight shrink-0', className)} style={style}>
      {p.kind === 'agent' && !showImg ? (
        <BloubAvatar participant={p} status={status} size={size} paper={ringColor} animated={animated} mode={mode} seed={p.personalAvatar && 'seed' in p.personalAvatar ? p.personalAvatar.seed : undefined} />
      ) : showImg ? (
        <img
          key={imgKey}
          src={cachedSrc ?? ''}
          alt={p.name}
          className="absolute inset-0 w-full h-full object-cover rounded-full"
          loading={AVATAR_IMG_LOADING}
          onError={onError}
        />
      ) : (
        <span style={{ letterSpacing: '-0.02em' }}>{p.initial}</span>
      )}
    </div>
  )
}

export function AvatarMini({
  p,
  size = 28,
  ringColor = 'var(--cloud)',
  statusOverride,
  animated = true,
  mode = 'neutral',
}: {
  p: Participant
  size?: number
  ringColor?: string
  statusOverride?: string
  animated?: boolean
  mode?: 'chat' | 'neutral'
}) {
  const status = useResolvedAvatarStatus(p, statusOverride)
  const agentUrl = p.personalAvatar && 'url' in p.personalAvatar ? p.personalAvatar.url : null
  const humanSrc = useCachedAvatarSrc(p.id, p.kind === 'agent' ? null : resolveUserAvatarUrl(p.avatarUrl, p.id))
  const cachedSrc = p.kind === 'agent' ? agentUrl : humanSrc
  const { showImg, imgKey, onError } = useAvatarImg(cachedSrc)
  return (
    <div
      className="relative grid shrink-0 place-items-center rounded-full font-display font-medium text-white"
      style={{
        width: size,
        height: size,
        background: p.kind === 'agent' || showImg ? 'transparent' : p.avatarBg,
        fontSize: Math.round(size * 0.4),
      }}
    >
      {p.kind === 'agent' && !showImg
        ? <BloubAvatar participant={p} status={status} size={size} paper={ringColor} animated={animated} mode={mode} seed={p.personalAvatar && 'seed' in p.personalAvatar ? p.personalAvatar.seed : undefined} />
        : showImg
        ? <img
            key={imgKey}
            src={cachedSrc ?? ''}
            alt={p.name}
            className="absolute inset-0 w-full h-full object-cover rounded-full"
            loading={AVATAR_IMG_LOADING}
            onError={onError}
          />
        : p.initial}
    </div>
  )
}

export function ProductLogo({ size = 22, rounded = false }: { size?: number; rounded?: boolean }) {
  return (
    <img
      src="/logo.svg"
      alt="LingxiLoop"
      draggable={false}
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        display: 'inline-block',
        verticalAlign: 'middle',
        userSelect: 'none',
        borderRadius: rounded ? Math.max(6, Math.round(size * 0.22)) : undefined,
      }}
    />
  )
}
