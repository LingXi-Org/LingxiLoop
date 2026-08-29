import { useMemo, useState } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useApp } from '@/stores/app'
import { type AuthCompany, useAuth } from '@/stores/auth'
import { WorkspaceCreateDialog } from '@/features/companies/components/WorkspaceCreateDialog'
import { IconPlus } from '@tabler/icons-react'

export function initials(name: string): string {
  const value = name.trim()
  if (!value) return '·'
  const words = value.split(/\s+/).filter(Boolean)
  return words.length > 1
    ? words.slice(0, 2).map((word) => word[0]).join('').toUpperCase()
    : Array.from(value).slice(0, 2).join('').toUpperCase()
}

export function companyColor(company: AuthCompany): string {
  let hash = 0
  for (const char of company.id) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0
  return `hsl(${Math.abs(hash) % 360} 58% 48%)`
}

function RailItem({ company, active, onSelect }: {
  company: AuthCompany
  active: boolean
  onSelect: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onSelect}
          aria-label={`切换到${company.name}`}
          aria-current={active ? 'page' : undefined}
          className="group relative flex h-11 w-full shrink-0 items-center justify-center"
        >
          <span
            aria-hidden
            className={cn(
              'absolute start-0 bg-sidebar-primary transition-[width,height,border-radius] duration-200',
              active
                ? 'h-9 w-1 rounded-e-full shadow-[0_0_0_2px_color-mix(in_srgb,var(--sidebar-primary)_14%,transparent)]'
                : 'size-2 rounded-full shadow-[0_0_0_2px_color-mix(in_srgb,var(--sidebar-primary)_12%,transparent)] group-hover:h-5 group-hover:w-1 group-hover:rounded-e-full',
            )}
          />
          <span
            className={cn(
              'grid size-9 place-items-center overflow-hidden rounded-lg text-xs font-medium tracking-tight text-white shadow-none transition-[background-color,transform] duration-150 group-active:scale-95',
              active && 'ring-2 ring-ring ring-offset-2 ring-offset-accent',
            )}
            style={{ background: companyColor(company) }}
          >
            {initials(company.name)}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10} className="max-w-64">
        <span className="font-semibold">{company.name}</span>
        <span className="ml-1.5 opacity-70">{company.role === 'owner' || company.role === 'admin' ? '个人工作区' : '课程工作区'}</span>
      </TooltipContent>
    </Tooltip>
  )
}

function RailGroup({ label, companies, activeId, onSelect }: {
  label: string
  companies: AuthCompany[]
  activeId: string | null
  onSelect: (id: string) => void
}) {
  if (companies.length === 0) return null
  return (
    <section aria-label={label} className="flex w-full flex-col items-center gap-4">
      <div className="h-px w-full bg-[var(--im-divider)]" />
      <span className="sr-only">{label}</span>
      {companies.map((company) => (
        <RailItem key={company.id} company={company} active={company.id === activeId} onSelect={() => onSelect(company.id)} />
      ))}
    </section>
  )
}

export function ServerRail() {
  const [createOpen, setCreateOpen] = useState(false)
  const companies = useAuth((state) => state.companies)
  const activeId = useAuth((state) => state.activeCompanyId)
  const setActive = useAuth((state) => state.setActiveCompany)
  const groups = useMemo(() => ({
    personal: companies.filter((company) => company.role === 'owner' || company.role === 'admin'),
    courses: companies.filter((company) => company.role !== 'owner' && company.role !== 'admin'),
  }), [companies])
  const orderedCompanies = useMemo(() => [...groups.personal, ...groups.courses], [groups])

  const select = (id: string) => {
    if (id === activeId) return
    useApp.getState().selectConversation(null)
    useApp.getState().setView('conversations')
    setActive(id)
  }

  return (
    <TooltipProvider delayDuration={120}>
      <nav aria-label="工作区" className="server-rail flex h-full w-16 shrink-0 flex-col items-center overflow-hidden bg-accent pb-2 pt-[26px] text-accent-foreground">
        <div className="mb-[6px] grid size-9 shrink-0 translate-x-px place-items-center rounded-lg bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground" aria-label="LingxiLoop">L</div>
        <div className="server-rail-scroll flex min-h-0 w-full translate-x-px flex-1 flex-col items-center gap-4 overflow-y-auto overflow-x-hidden pb-3">
          <RailGroup label="工作区" companies={orderedCompanies} activeId={activeId} onSelect={select} />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="创建工作区"
                onClick={() => setCreateOpen(true)}
                className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-transparent text-accent-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
              >
                <IconPlus size={20} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>创建工作区</TooltipContent>
          </Tooltip>
        </div>
      </nav>
      <WorkspaceCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </TooltipProvider>
  )
}
