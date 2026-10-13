// Adapted from Memos ui/dialog.tsx (MIT). Radix supplies only focus, Escape and dismissal behavior.

import { XIcon } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { type ComponentProps, useRef } from 'react'
import { cn } from '@/lib/utils'

export const Dialog = DialogPrimitive.Root
export function DialogContent({ children, className, ...props }: ComponentProps<typeof DialogPrimitive.Content>) {
  const returnFocus = useRef(document.activeElement)
  return <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
    <DialogPrimitive.Content {...props} className={cn('bg-background fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border shadow-lg p-4 sm:p-6', className)}
      onCloseAutoFocus={event => { event.preventDefault(); if (returnFocus.current instanceof HTMLElement) returnFocus.current.focus() }}>
      <div className="overflow-y-auto min-w-0 flex-1 flex flex-col gap-4 pe-1">{children}</div>
      <DialogPrimitive.Close className="absolute top-4 end-4 rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <XIcon className="size-4" /><span className="sr-only">关闭</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
}
export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-2 pe-6 text-start', className)} {...props} />
}
export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('text-lg leading-snug font-semibold', className)} {...props} />
}
export function DialogDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('text-muted-foreground text-sm', className)} {...props} />
}
