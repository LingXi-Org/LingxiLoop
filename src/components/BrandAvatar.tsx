import { createAvatar } from '@bible-strong/avatar-react'
import '@bible-strong/avatar-react/styles.css'
import './brand-avatar.css'
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import avatarDefinition from '@/assets/lingxiloop.avatar.json'
import {
  BRAND_AVATAR_ANGRY_ANIMATION,
  BRAND_AVATAR_ANGRY_EXPRESSION,
  BRAND_AVATAR_BASE_EXPRESSION,
  BRAND_AVATAR_IDLE_ANIMATION,
  BRAND_AVATAR_SQUINT_ANIMATION,
  BrandAvatarController,
  type BrandAvatarExpression,
} from './brand-avatar-controller'

const LingxiLoopAvatar = createAvatar(avatarDefinition)
const brandAvatarFrameStyle = {
  background: 'linear-gradient(135deg, color-mix(in srgb, var(--primary) 14%, var(--background)), color-mix(in srgb, var(--chart-1) 18%, var(--background)))',
  borderRadius: '18%',
  overflow: 'hidden',
} satisfies CSSProperties

export function useBrandAvatarInteraction(): {
  expression: BrandAvatarExpression
  registerClick: () => void
} {
  const [expression, setExpression] = useState<BrandAvatarExpression>(BRAND_AVATAR_BASE_EXPRESSION)
  const controllerRef = useRef<BrandAvatarController | null>(null)

  useEffect(() => {
    const controller = new BrandAvatarController(setExpression)
    controllerRef.current = controller
    controller.start()
    return () => {
      controller.dispose()
      controllerRef.current = null
    }
  }, [])

  const registerClick = useCallback(() => controllerRef.current?.registerClick(), [])
  return { expression, registerClick }
}

export function BrandAvatar({ expression, className }: {
  expression: BrandAvatarExpression
  className?: string
}) {
  if (expression === BRAND_AVATAR_ANGRY_EXPRESSION) {
    return (
      <LingxiLoopAvatar
        animation={BRAND_AVATAR_ANGRY_ANIMATION}
        size="100%"
        className={['brand-avatar--angry', className].filter(Boolean).join(' ')}
        style={brandAvatarFrameStyle}
        ariaLabel="LingxiLoop 品牌头像"
      />
    )
  }

  if (expression === BRAND_AVATAR_BASE_EXPRESSION) {
    return (
      <LingxiLoopAvatar
        animation={BRAND_AVATAR_IDLE_ANIMATION}
        size="100%"
        className={className}
        style={brandAvatarFrameStyle}
        ariaLabel="LingxiLoop 品牌头像"
      />
    )
  }

  return (
    <LingxiLoopAvatar
      animation={BRAND_AVATAR_SQUINT_ANIMATION}
      size="100%"
      className={className}
      style={brandAvatarFrameStyle}
      ariaLabel="LingxiLoop 品牌头像"
    />
  )
}
