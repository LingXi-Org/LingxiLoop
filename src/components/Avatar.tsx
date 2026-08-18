import type { CSSProperties } from 'react'
import type { Participant } from '@/types'
import { cn, statusColor } from '@/lib/utils'
import { AVATAR_IMG_LOADING, useAvatarImg, useCachedAvatarSrc } from '@/lib/avatarCache'
import { useAuth } from '@/stores/auth'
import { useComputers } from '@/stores/computers'

interface Props {
  p: Participant
  size?: number
  showStatus?: boolean
  statusOverride?: string
  ringColor?: string
  className?: string
}

export function Avatar({ p, size = 44, showStatus = true, statusOverride, ringColor = 'var(--paper)', className }: Props) {
  const dotSize = Math.max(10, Math.round(size * 0.27))
  const fontSize = Math.round(size * 0.36)
  // From your own perspective you're definitionally online — the app is
  // on your screen right now. The server-side status comes from real WS
  // presence and races the boot/reconnect flow (setStatus(avail) is fired
  // un-awaited just before the WS 'hello', so the refresh-on-hello can
  // read a stale 'resting' row), leaving you frozen offline-to-yourself.
  // Override the dot for the auth user's own avatar instead of trying to
  // win that race — other people still see the real server-driven state.
  const selfId = useAuth((s) => s.user?.id)
  // A BYOA agent is only as "online" as the computer it runs on. If its paired
  // (non-cloud) computer is offline, show the agent offline EVERYWHERE it renders
  // (conversation list, chat header, group members, …) — not just in AgentsView.
  // Cloud/managed agents and humans have no paired computer, so they're
  // unaffected. Subscribing to the specific computer re-renders the dot the
  // moment its status flips via the computers.status WS event.
  const host = useComputers((s) => (p.computerId ? s.byId[p.computerId] : undefined))
  const hostOffline = !!host && host.kind !== 'cloud' && host.status !== 'online'
  const ownStatus = p.id === selfId && p.kind === 'human' ? 'avail' : (hostOffline ? 'resting' : p.status)
  const status = statusOverride ?? ownStatus
  // Route the image through the local cache so it survives re-mounts
  // and gets invalidated on participants.avatar WS events + the 5-min
  // ticker. Falls back to raw URL while the first fetch is in flight.
  const cachedSrc = useCachedAvatarSrc(p.id, p.avatarUrl)
  // Bounded retry so one transient load failure doesn't permanently fall
  // back to the initial letter (see useAvatarImg).
  const { showImg, imgKey, onError } = useAvatarImg(cachedSrc)
  const style: CSSProperties = {
    width: size,
    height: size,
    background: showImg ? 'transparent' : p.avatarBg,
    fontSize,
  }

  return (
    <div className={cn('relative inline-grid place-items-center rounded-full font-display font-medium text-white tracking-tight shrink-0', className)} style={style}>
      {showImg ? (
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

export function AvatarMini({ p, size = 28, ringColor = 'var(--cloud)' }: { p: Participant; size?: number; ringColor?: string }) {
  const cachedSrc = useCachedAvatarSrc(p.id, p.avatarUrl)
  const { showImg, imgKey, onError } = useAvatarImg(cachedSrc)
  return (
    <div
      className="rounded-full grid place-items-center font-display font-medium text-white relative"
      style={{
        width: size,
        height: size,
        background: showImg ? 'transparent' : p.avatarBg,
        border: `2.5px solid ${ringColor}`,
        fontSize: Math.round(size * 0.4),
      }}
    >
      {showImg
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
  const visible = ps.slice(0, max)
  const overflow = ps.length - visible.length
  return (
    <div className="flex">
      {visible.map((p, i) => (
        <div key={p.id} style={{ marginLeft: i === 0 ? 0 : -10 }}>
          <AvatarMini p={p} size={size} />
        </div>
      ))}
      {overflow > 0 && (
        <div
          className="rounded-full grid place-items-center text-ink-500 text-[10px] font-bold"
          style={{
            width: size, height: size,
            background: 'var(--ink-100)',
            border: '2.5px solid var(--cloud)',
            marginLeft: -10,
          }}
        >+{overflow}</div>
      )}
    </div>
  )
}

export function CloudLogo({ size = 22 }: { size?: number }) {
  return (
    <img
      src="/logo.png"
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
      }}
    />
  )
}
