import type { HTMLAttributes, PropsWithChildren } from 'react'
import { cn } from '@/lib/utils'

type ComposerSurfaceProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>>

/** Shared composer chrome. RichInput and all send semantics stay with the
 * conversation controller; this component owns the responsive IM surface. */
export function ComposerSurface({ children, className, ...props }: ComposerSurfaceProps) {
  return (
    <div
      className={cn(
        'im-composer-surface chat-composer-shell shrink-0 bg-panel/95 backdrop-blur-xl',
        'px-5 pb-4 pt-2',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
