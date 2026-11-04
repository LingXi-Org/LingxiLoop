import { SidebarLeftIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Fragment, type ReactNode, type Ref } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useShellNav, useShellNavTrigger } from './ShellNav'

export interface PageHeaderCrumb {
  label: string
  onSelect?: () => void
}

/** The one page header: same height, divider and surface as the conversation
 * header. Context crumbs lead to the bold page title; actions sit at the end. */
export function PageHeader({ title, crumbs, leading, actions, className, titleRef, children }: {
  title: ReactNode
  crumbs?: PageHeaderCrumb[]
  leading?: ReactNode
  actions?: ReactNode
  className?: string
  titleRef?: Ref<HTMLHeadingElement>
  children?: ReactNode
}) {
  const openNav = useShellNav()
  const navTrigger = useShellNavTrigger()
  return (
    <header
      data-page-header
      className={cn(
        'select-none z-20 flex min-h-14 shrink-0 items-center gap-3 border-b border-[var(--im-divider-weak)] bg-background px-6 text-sidebar-foreground max-md:gap-2 max-md:px-3',
        className,
      )}
    >
      {leading ?? navTrigger ?? (openNav ? <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0 text-muted-foreground" aria-label="打开导航" onClick={openNav}>
        <HugeiconsIcon icon={SidebarLeftIcon} strokeWidth={2} className="size-5" />
      </Button> : null)}
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {crumbs?.length ? (
          <nav aria-label="位置" className="flex min-w-0 shrink items-center gap-1.5 text-sm text-muted-foreground max-sm:hidden">
            {crumbs.map((crumb, index) => (
              <Fragment key={`${crumb.label}:${index}`}>
                {crumb.onSelect
                  ? <button type="button" onClick={crumb.onSelect} className="max-w-48 truncate rounded-md hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">{crumb.label}</button>
                  : <span className="max-w-48 truncate">{crumb.label}</span>}
                <span aria-hidden="true" className="text-muted-foreground/50">/</span>
              </Fragment>
            ))}
          </nav>
        ) : null}
        <h1 ref={titleRef} tabIndex={titleRef ? -1 : undefined} className="min-w-0 truncate font-heading text-[26px] font-semibold tracking-tight max-md:text-xl text-foreground focus-visible:outline-2 focus-visible:outline-ring">{title}</h1>
        {children}
      </div>
      {actions ? <div className="ms-auto flex shrink-0 items-center gap-1">{actions}</div> : null}
    </header>
  )
}

/** A page below a PageHeader: the header stays put and only the body scrolls. */
export function PageLayout({ header, children, className, scrollProps }: {
  header: ReactNode
  children: ReactNode
  className?: string
  scrollProps?: React.HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, string | undefined>
}) {
  return (
    <div className={cn('@container/page flex h-full min-h-0 flex-col bg-background text-foreground', className)}>
      {header}
      <div data-page-scroll {...scrollProps} className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain', scrollProps?.className)}>
        {children}
      </div>
    </div>
  )
}

/** Business page content column: 1200px max, 24px gutter (16px on phones). */
export function PageBody({ children, className, narrow = false }: { children: ReactNode; className?: string; narrow?: boolean }) {
  return <div className={cn('mx-auto w-full px-6 py-6 max-md:px-4 max-md:py-4', narrow ? 'max-w-[800px]' : 'max-w-[1200px]', className)}>{children}</div>
}

/** A row of page-level filters/search directly above the content. */
export function PageToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mb-4 flex flex-wrap items-center gap-2', className)}>{children}</div>
}
