import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Alert02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Toaster } from '@/components/ui/sonner'
import { Input } from '@/components/ui/input'
import {
  subscribeSensitiveActions,
  type SensitiveActionRequest,
} from '@/lib/confirmAction'

export function GlobalInteractionProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<SensitiveActionRequest[]>([])
  const current = queue[0] ?? null
  const [inputValue, setInputValue] = useState('')

  useEffect(() => subscribeSensitiveActions((request) => {
    setQueue((items) => [...items, request])
  }), [])

  useEffect(() => {
    setInputValue(current?.kind === 'input' ? current.inputDefaultValue ?? '' : '')
  }, [current?.id])

  const settle = useCallback((confirmed: boolean) => {
    if (!current || current.settled) return
    if (confirmed && current.kind === 'input' && current.inputRequired && !inputValue.trim()) return
    current.settled = true
    if (current.kind === 'input') current.resolve(confirmed ? inputValue.trim() : null)
    else current.resolve(confirmed)
    setQueue((items) => items.filter((item) => item.id !== current.id))
  }, [current, inputValue])

  return (
    <>
      {children}
      <AlertDialog open={current !== null} onOpenChange={(open) => { if (!open) settle(false) }}>
        {current && (
          <AlertDialogContent size="default" className="w-[380px] max-w-[calc(100vw-2rem)] gap-0 rounded-2xl border-0 p-0 shadow-[0_0_0_1px_var(--border),0_24px_60px_-12px_rgb(20_20_18/25%)]">
            <AlertDialogHeader className="flex flex-col items-start gap-2.5 px-5 pb-1 pt-5 text-start">
              <AlertDialogMedia className={current.tone === 'destructive' ? 'size-9 rounded-[11px] bg-[rgb(200_70_59/12%)] text-[#C8463B]' : 'size-9 rounded-[11px] bg-[var(--warning-surface)] text-warning'}>
                <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} aria-hidden="true" />
              </AlertDialogMedia>
              <AlertDialogTitle className="text-base font-semibold">{current.title}</AlertDialogTitle>
              <AlertDialogDescription className="text-[13.5px] leading-[1.7] text-fg2">{current.description}</AlertDialogDescription>
            </AlertDialogHeader>
            {current.kind === 'input' && (
              <label className="mx-5 mt-3 grid gap-1.5 text-sm">
                <span className="font-medium text-foreground">{current.inputLabel}</span>
                <Input
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                  placeholder={current.inputPlaceholder}
                  autoFocus
                />
              </label>
            )}
            <AlertDialogFooter className="m-0 flex-row justify-end gap-1.5 border-0 bg-transparent p-4">
              <AlertDialogCancel onClick={() => settle(false)} className="h-[34px] rounded-[10px] border-0 bg-transparent px-3 text-[13.5px] font-medium text-fg2 shadow-none hover:bg-accent">
                {current.cancelLabel ?? '取消'}
              </AlertDialogCancel>
              <AlertDialogAction
                variant={current.tone === 'destructive' ? 'destructive' : 'default'}
                className={current.tone === 'destructive' ? 'h-[34px] rounded-[10px] bg-[#C8463B] px-3.5 text-[13.5px] font-medium text-white hover:bg-[#B03C32]' : 'h-[34px] rounded-[10px] bg-brand px-3.5 text-[13.5px] font-medium text-brand-foreground'}
                onClick={() => settle(true)}
                disabled={current.kind === 'input' && current.inputRequired && !inputValue.trim()}
              >
                {current.confirmLabel ?? '继续'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
      <Toaster />
    </>
  )
}
