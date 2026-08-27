import {
  Building2 as IconBuilding,
  Check as IconCheck,
  ChevronDown as IconChevronDown,
  Folder as IconFolder,
  LogOut as IconLogout,
  RefreshCw as IconRefresh,
  Settings as IconSettings,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/api/client'
import { Avatar } from '@/components/Avatar'
import { ThemeToggle } from '@/components/ThemeToggle'
import { isMockImDevelopment } from '@/lib/devMode'
import { getWorkspaceSession, setWorkspaceSession } from '@/lib/workspaceSession'
import { useApp } from '@/stores/app'
import { useUiCommands } from '@/stores/uiCommands'
import { useAuth } from '@/stores/auth'
import { useConversations } from '@/stores/conversations'
import { useParticipants } from '@/stores/participants'
import type { Participant } from '@/types'

interface SidebarProject {
  id: string
  name: string
  color: string
  conversationCount: number
  isGeneral: boolean
}

const MOCK_PROJECTS: SidebarProject[] = [
  { id: 'mock-research', name: 'AI 产品研究', color: '#7c5cff', conversationCount: 3, isGeneral: false },
  { id: 'mock-launch', name: '秋季发布计划', color: '#d97706', conversationCount: 2, isGeneral: false },
  { id: 'mock-general', name: '通用项目', color: '#64748b', conversationCount: 1, isGeneral: true },
]

type OpenPanel = 'projects' | 'account' | null

function ProjectMark({ color }: { color: string }) {
  return <span className="grok-project-mark" style={{ '--project-color': color } as React.CSSProperties}><IconFolder size={15} strokeWidth={1.65} /></span>
}

export function SidebarFooter() {
  const authUser = useAuth((state) => state.user)
  const appView = useApp((state) => state.view)
  const companies = useAuth((state) => state.companies)
  const activeCompanyId = useAuth((state) => state.activeCompanyId)
  const setActiveCompany = useAuth((state) => state.setActiveCompany)
  const me = useParticipants((state) => authUser?.id ? state.byId[authUser.id] : undefined)
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null)
  const [projects, setProjects] = useState<SidebarProject[]>([])
  const [projectsLoaded, setProjectsLoaded] = useState(false)
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [projectError, setProjectError] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const fallback = useMemo<Participant>(() => ({
    id: authUser?.id ?? 'me',
    kind: 'human',
    name: authUser?.name ?? '我',
    initial: (authUser?.name ?? '我').charAt(0),
    avatarBg: 'linear-gradient(135deg,#1084fe,#7c5cff)',
    status: 'avail',
  }), [authUser?.id, authUser?.name])

  useEffect(() => {
    if (!openPanel) return
    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpenPanel(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenPanel(null)
    }
    document.addEventListener('pointerdown', closeOnOutside)
    window.addEventListener('keydown', closeOnEscape, true)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside)
      window.removeEventListener('keydown', closeOnEscape, true)
    }
  }, [openPanel])

  useEffect(() => {
    if (openPanel !== 'projects' || projectsLoaded || projectsLoading) return
    setProjectsLoading(true)
    setProjectError(false)
    const load = isMockImDevelopment()
      ? Promise.resolve(MOCK_PROJECTS)
      : api.listProjects().then((items) => items
        .filter((item) => item.status === 'active')
        .map((item) => ({
          id: item.id,
          name: item.name,
          color: item.color || '#64748b',
          conversationCount: item.conversationCount,
          isGeneral: item.isGeneral,
        })))
    void load
      .then((items) => {
        setProjects(items)
        setProjectsLoaded(true)
        setSelectedProjectId((current) => current ?? items[0]?.id ?? null)
      })
      .catch(() => setProjectError(true))
      .finally(() => setProjectsLoading(false))
  }, [openPanel, projectsLoaded, projectsLoading])

  const togglePanel = (panel: Exclude<OpenPanel, null>) => {
    setOpenPanel((current) => current === panel ? null : panel)
  }

  const switchCompany = (companyId: string) => {
    if (companyId !== activeCompanyId) {
      useApp.getState().selectConversation(null)
      setActiveCompany(companyId)
      setWorkspaceSession(null)
      setProjects([])
      setProjectsLoaded(false)
      setSelectedProjectId(null)
    }
    setOpenPanel(null)
  }

  const switchProject = async (projectId: string) => {
    if (!activeCompanyId) return
    setWorkspaceSession({ companyId: activeCompanyId, projectId })
    setSelectedProjectId(projectId)
    useApp.getState().selectConversation(null)
    setOpenPanel(null)
    if (isMockImDevelopment()) {
      const { activateMockWorkspace } = await import('@/dev/mockIm')
      activateMockWorkspace(projectId)
    } else {
      await Promise.allSettled([
        api.openProject(projectId),
        useParticipants.getState().load(),
        useConversations.getState().reload(),
      ])
    }
  }

  useEffect(() => {
    const selected = getWorkspaceSession()
    setSelectedProjectId(selected?.companyId === activeCompanyId ? selected.projectId : null)
  }, [activeCompanyId])

  const signOut = async () => {
    try { await api.authLogout() } catch { /* best effort */ }
    useAuth.getState().clear()
    location.reload()
  }

  const activeCompany = companies.find((company) => company.id === activeCompanyId) ?? companies[0] ?? null

  return (
    <div ref={rootRef} className="grok-sidebar-footer omb-no-drag">
      {openPanel === 'projects' && (
        <section className="grok-sidebar-popover grok-project-popover" aria-label="项目" role="menu">
          <header className="grok-sidebar-popover-header">
            <span>Projects</span>
          </header>
          <div className="grok-sidebar-popover-list">
            {projectsLoading && <div className="grok-sidebar-popover-empty">正在载入…</div>}
            {!projectsLoading && projectError && (
              <button type="button" className="grok-sidebar-popover-empty" onClick={() => { setProjectError(false); setProjectsLoaded(false) }}>重新载入</button>
            )}
            {!projectsLoading && !projectError && projects.length === 0 && <div className="grok-sidebar-popover-empty">还没有项目</div>}
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                className="grok-project-row"
                role="menuitemradio"
                aria-checked={selectedProjectId === project.id}
                data-selected={selectedProjectId === project.id || undefined}
                onClick={() => void switchProject(project.id)}
              >
                <ProjectMark color={project.color} />
                <span className="grok-project-row-copy">
                  <strong>{project.name}</strong>
                </span>
                {selectedProjectId === project.id && <IconCheck size={16} strokeWidth={1.7} />}
              </button>
            ))}
          </div>
        </section>
      )}

      {openPanel === 'account' && (
        <section className="grok-sidebar-popover grok-account-popover" aria-label="用户菜单" role="dialog">
          <div className="grok-account-summary">
            <Avatar p={me ?? fallback} size={34} ringColor="var(--im-nav-surface)" />
            <span><strong>{authUser?.name ?? '我的账号'}</strong><small>{authUser?.email ?? ''}</small></span>
          </div>
          {companies.length > 0 && (
            <div className="grok-account-section">
              <div className="grok-account-section-label">组织</div>
              {companies.map((company) => (
                <button key={company.id} type="button" className="grok-account-menu-row" onClick={() => switchCompany(company.id)}>
                  <IconBuilding size={17} strokeWidth={1.65} />
                  <span>{company.name}</span>
                  {company.id === activeCompanyId && <IconCheck size={15} strokeWidth={1.7} />}
                </button>
              ))}
            </div>
          )}
          <div className="grok-account-section">
            <ThemeToggle showLabel className="grok-account-menu-row" onToggle={() => setOpenPanel(null)} />
            <button type="button" className="grok-account-menu-row" onClick={() => { useUiCommands.getState().dispatch('open-updater'); setOpenPanel(null) }}>
              <IconRefresh size={17} strokeWidth={1.65} /><span>检查更新</span>
            </button>
          </div>
          <button type="button" className="grok-account-menu-row is-destructive" onClick={() => void signOut()}>
            <IconLogout size={17} strokeWidth={1.65} /><span>退出登录</span>
          </button>
        </section>
      )}

      <button
        type="button"
        className="grok-sidebar-footer-row"
        data-active={openPanel === 'projects' || undefined}
        aria-expanded={openPanel === 'projects'}
        onClick={() => togglePanel('projects')}
      >
        <IconFolder size={19} strokeWidth={1.55} />
        <span className="grok-sidebar-footer-label">{projects.find((project) => project.id === selectedProjectId)?.name ?? 'Projects'}</span>
        <IconChevronDown className="grok-sidebar-row-chevron" size={16} strokeWidth={1.55} />
      </button>

      <button type="button" className="grok-sidebar-footer-row" data-active={appView === 'me' || undefined} onClick={() => { setOpenPanel(null); useApp.getState().setView('me') }}>
        <IconSettings size={19} strokeWidth={1.55} />
        <span className="grok-sidebar-footer-label">设置</span>
      </button>

      <button type="button" className="grok-sidebar-footer-row" data-active={appView === 'management' || undefined} onClick={() => { setOpenPanel(null); useApp.getState().setView('management') }}>
        <IconBuilding size={19} strokeWidth={1.55} />
        <span className="grok-sidebar-footer-label">Company & Courses</span>
      </button>

      <button
        type="button"
        className="grok-sidebar-account-trigger"
        data-active={openPanel === 'account' || undefined}
        aria-expanded={openPanel === 'account'}
        onClick={() => togglePanel('account')}
      >
        <Avatar p={me ?? fallback} size={28} ringColor="var(--im-nav-surface)" />
        <span className="grok-sidebar-account-copy">
          <strong>{authUser?.name ?? '我的账号'}</strong>
          <small>{activeCompany?.name ?? authUser?.email ?? ''}</small>
        </span>
        <IconChevronDown className="grok-sidebar-row-chevron" size={16} strokeWidth={1.55} />
      </button>
    </div>
  )
}
