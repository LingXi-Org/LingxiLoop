import {
  BarChart3 as IconChartBar,
  Check as IconCheck,
  DownloadCloud as IconCloudDownload,
  ExternalLink as IconExternalLink,
  GitBranch as IconGitBranch,
  RefreshCw as IconRefresh,
  Settings as IconSettings,
  X as IconX,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Avatar } from '@/components/Avatar'
import { useAuth } from '@/stores/auth'
import { useParticipants } from '@/stores/participants'
import { useTheme } from '@/stores/theme'
import type { Participant } from '@/types'

type SettingsSectionId = 'general' | 'router' | 'usage' | 'beta'

const SETTINGS_SECTIONS = [
  { id: 'general', label: 'General', icon: IconSettings },
  { id: 'router', label: 'Router', icon: IconGitBranch },
  { id: 'usage', label: 'Usage & Billing', icon: IconChartBar },
  { id: 'beta', label: 'Updates', icon: IconCloudDownload },
] as const

const ROUTER_PROVIDERS = [
  { id: 'cursor', label: 'Cursor', description: 'Use your signed-in Cursor account and its hosted agent models.' },
  { id: 'claude-code', label: 'Claude Code', description: "Use Anthropic's Claude Code provider for agent requests." },
  { id: 'codex', label: 'Codex', description: "Use OpenAI's Codex provider for agent requests." },
  { id: 'openrouter', label: 'OpenRouter', description: 'Use models and billing from your OpenRouter account.' },
] as const

function DemoSwitch({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button type="button" className="sand-settings-switch" data-checked={checked || undefined} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}>
      <span />
    </button>
  )
}

function SettingsRow({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div className="sand-settings-row">
      <div className="sand-settings-copy"><strong>{title}</strong><span className="sand-settings-field__hint">{hint}</span></div>
      <div className="sand-settings-control">{children}</div>
    </div>
  )
}

function GeneralPanel() {
  const authUser = useAuth((state) => state.user)
  const me = useParticipants((state) => authUser?.id ? state.byId[authUser.id] : undefined)
  const theme = useTheme((state) => state.theme)
  const toggleTheme = useTheme((state) => state.toggleTheme)
  const [notifications, setNotifications] = useState(true)
  const [launchAtLogin, setLaunchAtLogin] = useState(false)
  const [sound, setSound] = useState(true)
  const fallback = useMemo<Participant>(() => ({
    id: authUser?.id ?? 'me', kind: 'human', name: authUser?.name ?? 'User',
    initial: (authUser?.name ?? 'U').charAt(0), avatarBg: '#1084fe', status: 'avail',
  }), [authUser?.id, authUser?.name])

  return (
    <div className="sand-settings-general">
      <section>
        <h3>Account</h3>
        <div className="sand-account-card">
          <div className="sand-account-card__avatar"><Avatar p={me ?? fallback} size={36} showStatus={false} /></div>
          <div className="sand-account-card__body"><strong>{authUser?.name ?? 'LingxiLoop User'}</strong><span>{authUser?.email ?? 'Signed in'}</span></div>
          <button type="button">Manage account <IconExternalLink size={13} strokeWidth={1.7} /></button>
        </div>
      </section>
      <section>
        <h3>App</h3>
        <div className="sand-settings-stack">
          <SettingsRow title="Appearance" hint="Choose how LingxiLoop looks on this device.">
            <button type="button" className="ui-select-trigger" onClick={toggleTheme}>{theme === 'dark' ? 'Dark' : 'Light'}</button>
          </SettingsRow>
          <SettingsRow title="Language" hint="Language used throughout the app."><button type="button" className="ui-select-trigger">English</button></SettingsRow>
          <SettingsRow title="Desktop notifications" hint="Show notifications for new messages and completed work."><DemoSwitch checked={notifications} onChange={setNotifications} label="Desktop notifications" /></SettingsRow>
          <SettingsRow title="Launch at login" hint="Open LingxiLoop when you sign in to this computer."><DemoSwitch checked={launchAtLogin} onChange={setLaunchAtLogin} label="Launch at login" /></SettingsRow>
          <SettingsRow title="Sounds" hint="Play subtle sounds for messages and agent activity."><DemoSwitch checked={sound} onChange={setSound} label="Sounds" /></SettingsRow>
        </div>
      </section>
    </div>
  )
}

function RouterPanel() {
  const [provider, setProvider] = useState<(typeof ROUTER_PROVIDERS)[number]['id']>('cursor')
  return (
    <div className="sand-router-section">
      <div className="sand-settings-intro"><strong>Agent router</strong><span>Choose which provider handles new agent requests.</span></div>
      <div className="sand-router-provider-list">
        {ROUTER_PROVIDERS.map((item) => (
          <button key={item.id} type="button" className="sand-router-provider" data-active={provider === item.id || undefined} onClick={() => setProvider(item.id)}>
            <span className="sand-router-provider__radio">{provider === item.id && <span />}</span>
            <span className="sand-router-provider__copy"><strong>{item.label}</strong><small>{item.description}</small></span>
            {provider === item.id && <IconCheck size={17} strokeWidth={1.8} />}
          </button>
        ))}
      </div>
      <SettingsRow title="Default model" hint="Used when a conversation does not select a model."><button type="button" className="ui-select-trigger">Auto</button></SettingsRow>
    </div>
  )
}

function UsageMeter({ label, percent, note }: { label: string; percent: number; note: string }) {
  return (
    <div className="sand-usage-meter">
      <div className="sand-usage-meter__header"><strong>{label}</strong><small>{note}</small></div>
      <span className="sand-usage-meter__track"><span className="sand-usage-meter__fill" style={{ width: `${percent}%` }} /></span>
      <small>{percent}% used</small>
    </div>
  )
}

function UsagePanel() {
  return (
    <div className="sand-usage-section">
      <div><h3>Current plan</h3><div className="sand-usage-state"><span><strong>Max</strong><small>Renews Sep 18, 2026</small></span><button type="button">Manage plan</button></div></div>
      <div><h3>Included usage</h3><UsageMeter label="Weekly agent usage" percent={42} note="Resets in 4 days" /><UsageMeter label="On-demand usage" percent={18} note="US$9.20 remaining" /></div>
      <div className="sand-provider-usage-card"><strong>Provider usage</strong><span>Usage from external providers is managed by the connected provider account.</span></div>
    </div>
  )
}

function UpdatesPanel() {
  const [automatic, setAutomatic] = useState(true)
  const [checking, setChecking] = useState(false)
  const [checked, setChecked] = useState(false)
  const check = () => {
    setChecking(true); setChecked(false)
    window.setTimeout(() => { setChecking(false); setChecked(true) }, 650)
  }
  return (
    <div className="sand-settings-beta-stack">
      <div className="sand-settings-uptodate-banner"><strong>LingxiLoop is up to date</strong><span>Version 0.1.0-beta</span>{checked && <span>Last checked just now</span>}<button type="button" className="sand-settings-force-refresh" onClick={check} disabled={checking}><IconRefresh size={14} strokeWidth={1.7} /> {checking ? 'Checking…' : 'Check for updates'}</button></div>
      <SettingsRow title="Automatic updates" hint="Download and install updates when the app is closed."><DemoSwitch checked={automatic} onChange={setAutomatic} label="Automatic updates" /></SettingsRow>
      <SettingsRow title="Release channel" hint="Receive stable product updates."><button type="button" className="ui-select-trigger">Stable</button></SettingsRow>
    </div>
  )
}

function renderPanel(section: SettingsSectionId) {
  if (section === 'router') return <RouterPanel />
  if (section === 'usage') return <UsagePanel />
  if (section === 'beta') return <UpdatesPanel />
  return <GeneralPanel />
}

export function GrokSettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('general')
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [isOpen, onClose])
  if (!isOpen) return null
  const active = SETTINGS_SECTIONS.find((section) => section.id === activeSection) ?? SETTINGS_SECTIONS[0]
  const panelId = `sand-settings-panel-${active.id}`
  const headingId = `${panelId}-heading`
  return (
    <div className="grok-settings-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
      <div className="sand-settings-dialog" role="dialog" aria-modal="true" aria-label="LingxiLoop settings" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sand-settings-layout">
          <nav aria-label="Settings sections" className="sand-settings-nav">
            {SETTINGS_SECTIONS.map((section) => {
              const Icon = section.icon
              const selected = section.id === active.id
              return (
                <button aria-controls={selected ? panelId : undefined} aria-current={selected ? 'page' : undefined} className="sand-settings-nav__item" data-active={selected || undefined} key={section.id} onClick={() => setActiveSection(section.id)} type="button">
                  <Icon size={17} strokeWidth={1.55} /><span>{section.label}</span>
                </button>
              )
            })}
          </nav>
          <section aria-labelledby={headingId} className="sand-settings-panel" id={panelId}>
            <button type="button" aria-label="Close" className="sand-settings-panel__close" onClick={onClose}><IconX size={18} strokeWidth={1.65} /></button>
            <h2 id={headingId}>{active.label}</h2>
            <div className="sand-settings-panel__body">{renderPanel(active.id)}</div>
          </section>
        </div>
      </div>
    </div>
  )
}
