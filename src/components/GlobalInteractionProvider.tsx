import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { TriangleAlertIcon } from 'lucide-react'
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
          <AlertDialogContent size="default">
            <AlertDialogHeader>
              <AlertDialogMedia className={current.tone === 'destructive' ? 'bg-destructive/10 text-destructive' : undefined}>
                <TriangleAlertIcon aria-hidden="true" />
              </AlertDialogMedia>
              <AlertDialogTitle>{current.title}</AlertDialogTitle>
              <AlertDialogDescription>{current.description}</AlertDialogDescription>
            </AlertDialogHeader>
            {current.kind === 'input' && (
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium text-foreground">{current.inputLabel}</span>
                <Input
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                  placeholder={current.inputPlaceholder}
                  autoFocus
                />
              </label>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => settle(false)}>
                {current.cancelLabel ?? '取消'}
              </AlertDialogCancel>
              <AlertDialogAction
                variant={current.tone === 'destructive' ? 'destructive' : 'default'}
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
