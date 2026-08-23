import type { HTMLAttributes, PropsWithChildren } from 'react'
import { cn } from '@/lib/utils'

type ComposerSurfaceProps = PropsWithChildren<{
  variant?: 'desktop' | 'mobile'
} & HTMLAttributes<HTMLDivElement>>

/** Shared composer chrome. RichInput and all send semantics stay with the
 * conversation controller; this component owns the responsive IM surface and
 * safe-area contract used by every platform shell. */
export function ComposerSurface({ children, variant = 'desktop', className, ...props }: ComposerSurfaceProps) {
  return (
    <div
      className={cn(
        'im-composer-surface chat-composer-shell shrink-0 border-t border-hairline bg-panel/95 backdrop-blur-xl',
        variant === 'mobile' ? 'kb-aware px-3 pt-1.5' : 'px-5 pb-4 pt-2',
        className,
      )}
      data-im-variant={variant}
      {...props}
    >
      {children}
    </div>
  )
}
