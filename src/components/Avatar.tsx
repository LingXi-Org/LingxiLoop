import type { CSSProperties } from 'react'
import { AVATAR_IMG_LOADING, useAvatarImg, useCachedAvatarSrc } from '@/lib/avatarCache'
import { cn, statusColor } from '@/lib/utils'
import { useAuth } from '@/stores/auth'
import type { Participant } from '@/types'
import { BloubAvatar } from './BloubAvatar'

interface Props {
  p: Participant
  size?: number
  showStatus?: boolean
  statusOverride?: string
  ringColor?: string
  className?: string
  /** Disable continuous motion for dense composite surfaces such as HiveAvatar. */
  animated?: boolean
  /** Live agent states are reserved for avatars rendered in the Chat Panel. */
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

export function Avatar({ p, size = 44, showStatus = true, statusOverride, ringColor = 'var(--paper)', className, animated = true, mode = 'neutral' }: Props) {
  const dotSize = Math.max(10, Math.round(size * 0.27))
  const fontSize = Math.round(size * 0.36)
  const status = useResolvedAvatarStatus(p, statusOverride)
  // Route human images through the local cache so they survive re-mounts.
  // Agent image URLs are intentionally ignored: their single source of
  // visual identity is the deterministic Bloub renderer. Human cache entries
  // are still invalidated by participant avatar events and the refresh ticker.
  const cachedSrc = useCachedAvatarSrc(p.id, p.kind === 'agent' ? null : p.avatarUrl)
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
      {p.kind === 'agent' ? (
        <BloubAvatar participant={p} status={status} size={size} paper={ringColor} animated={animated} mode={mode} />
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
      {showStatus && (
        <span
          className="absolute rounded-full z-[1]"
          style={{
            width: dotSize,
            height: dotSize,
            background: statusColor(status),
            boxShadow: `0 0 0 ${Math.max(2, dotSize / 5)}px ${ringColor}`,
            bottom: -1,
            right: -1,
          }}
        />
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
  const cachedSrc = useCachedAvatarSrc(p.id, p.kind === 'agent' ? null : p.avatarUrl)
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
      {p.kind === 'agent'
        ? <BloubAvatar participant={p} status={status} size={size} paper={ringColor} animated={animated} mode={mode} />
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

export function AvatarStack({ ps, size = 28, max = 4 }: { ps: Participant[]; size?: number; max?: number }) {
  // The overflow badge occupies one of the advertised slots; otherwise
  // `max={3}` could render three portraits PLUS a fourth badge and overflow.
  const visibleLimit = Math.max(0, max - (ps.length > max ? 1 : 0))
  const visible = ps.slice(0, visibleLimit)
  const overflow = ps.length - visible.length
  const itemCount = visible.length + (overflow > 0 ? 1 : 0)
  // The old fixed -10px overlap still produced a 76px-wide row for three
  // 34px avatars inside a 56px conversation slot. A bounded step keeps the
  // whole cluster compact at every call-site, including tablet headers.
  const step = Math.min(11, Math.max(7, Math.round(size * 0.32)))
  const width = itemCount > 0 ? size + (itemCount - 1) * step : 0
  return (
    <div className="relative shrink-0" style={{ width, height: size }}>
      {visible.map((p, i) => (
        <div key={p.id} className="absolute top-0" style={{ left: i * step, zIndex: itemCount - i }}>
          <AvatarMini p={p} size={size} />
        </div>
      ))}
      {overflow > 0 && (
        <div
          className="absolute top-0 grid place-items-center rounded-xl bg-raised text-[10px] font-bold text-ink-secondary"
          style={{
            width: size, height: size,
            left: visible.length * step,
            zIndex: 0,
          }}
        >+{overflow}</div>
      )}
    </div>
  )
}

export function CloudLogo({ size = 22, rounded = false }: { size?: number; rounded?: boolean }) {
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
