import { type ReactNode, useLayoutEffect } from 'react'
import { SkeletonRegion } from '@/components/ResourceSkeleton'
import { Skeleton } from '@/components/ui/skeleton'

let holders = 0
const bootShell = () => typeof document === 'undefined' ? null : document.getElementById('boot-shell')

/** Boot phases (session, code, authorized navigation) hand the same static
 * index.html shell to each other instead of remounting a fresh skeleton. Layout
 * effects of one commit run before paint, so a handoff never shows a frame. */
/** Mounted around the root: its layout effect runs after every child's, so a
 * first commit without a boot phase (sign-in, invitation, error) hides the shell. */
export function BootShellRelease({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    const shell = bootShell()
    if (shell && holders === 0) shell.hidden = true
  }, [])
  return children
}

export function WorkspaceSkeleton() {
  const shell = bootShell()
  useLayoutEffect(() => {
    if (!shell) return
    holders += 1
    shell.hidden = false
    return () => {
      holders -= 1
      if (holders === 0) shell.hidden = true
    }
  }, [shell])
  if (shell) return null
  return <SkeletonRegion label="正在打开工作台" className="fixed inset-0 flex gap-2 bg-background p-2">
    <div className="flex w-12 shrink-0 flex-col items-center gap-6 py-4"><Skeleton className="size-9 rounded-full" />{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="size-6 rounded-lg" />)}</div>
    <div className="flex min-w-0 flex-1 overflow-hidden rounded-2xl border bg-card">
      <div className="w-full space-y-5 border-e p-3 md:w-64 md:shrink-0"><Skeleton className="h-9 rounded-full" />{Array.from({ length: 6 }, (_, index) => <div key={index} className="flex items-center gap-3"><Skeleton className="size-10 shrink-0 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-3/4" /><Skeleton className="h-3 w-1/2" /></div></div>)}</div>
      <div className="hidden min-w-0 flex-1 flex-col md:flex"><div className="border-b p-4"><Skeleton className="h-5 w-44" /></div><div className="flex-1" /><div className="p-4"><Skeleton className="h-14 rounded-3xl" /></div></div>
    </div>
  </SkeletonRegion>
}
