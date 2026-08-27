import { X } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { EASE_OUT } from '@/lib/motion'

interface DetailPanelProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  detail?: ReactNode
  detailWidth?: number
  children: ReactNode
}

/** Desktop split layout with a caller-owned, resizable detail surface. */
export function DetailPanel({
  open,
  onClose,
  title,
  detail,
  detailWidth = 400,
  children,
}: DetailPanelProps) {
  const reduceMotion = useReducedMotion()
  const duration = reduceMotion ? 0 : 0.24

  return <div className="flex h-full min-h-0">
    <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    <motion.aside
      initial={false}
      animate={{ width: open ? detailWidth : 0 }}
      transition={{ duration, ease: EASE_OUT }}
      className="shrink-0 overflow-hidden"
      aria-hidden={!open}
    >
      <div className="flex h-full flex-col border-l border-border bg-sidebar" style={{ width: detailWidth }}>
        <header className="sticky top-0 flex h-12 shrink-0 items-center justify-between gap-2 px-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">{title}</div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="关闭详情">
            <X className="size-4.5" />
          </Button>
        </header>
        {open ? <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration, ease: EASE_OUT }}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          {detail}
        </motion.div> : null}
      </div>
    </motion.aside>
  </div>
}
