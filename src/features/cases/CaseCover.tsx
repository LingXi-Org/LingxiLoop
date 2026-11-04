import type { CSSProperties, ReactNode } from 'react'
import { coverColors, coverDesign, type CoverColor } from './cover-design'

export function CaseCover({ title, coverText, coverColor, className = '', coverLink }: {
  title: string
  coverText?: string
  coverColor?: CoverColor
  className?: string
  coverLink?: ReactNode
}) {
  const { text, color } = coverDesign({ title, coverText, coverColor })
  const palette = coverColors[color]
  return <div data-case-cover className={`case-text-cover ${className}`} style={{
    '--case-cover-background': palette.background, '--case-cover-dots': palette.dots,
  } as CSSProperties}>
    <span role="img" aria-label={`${title || '案例'}的封面：${text}`} className={text.length > 8 ? 'case-cover-long-text' : undefined}>{text}</span>
    {coverLink}
  </div>
}
