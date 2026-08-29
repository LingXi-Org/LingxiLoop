import {
  CloudDownloadIcon,
  RefreshCwIcon,
  Settings02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { type ReactNode, useState } from 'react'
import { Avatar as ParticipantAvatar } from '@/components/Avatar'
import { useUpdater } from '@/components/UpdaterDialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useParticipants } from '@/features/agents/state'
import { toastAction } from '@/lib/actionToast'
import { useAuth } from '@/stores/auth'
import { useSoundStore } from '@/stores/sound'
import { useTheme } from '@/stores/theme'

type SettingsSectionId = 'general' | 'updates'

const SETTINGS_SECTIONS = [
  { id: 'general', label: 'General', icon: Settings02Icon },
  { id: 'updates', label: 'Updates', icon: CloudDownloadIcon },
] as const

function SettingsRow({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 rounded-3xl border border-border bg-card px-4 py-3">
      <div className="min-w-0">
        <strong className="block text-sm font-medium text-foreground">{title}</strong>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function AccountCard() {
  const authUser = useAuth((state) => state.user)
  const participant = useParticipants((state) => authUser?.id ? state.byId[authUser.id] : undefined)
  const initial = (authUser?.name ?? 'U').trim().charAt(0).toUpperCase() || 'U'

  return (
    <div className="flex items-center gap-3 rounded-3xl border border-border bg-card p-4">
      {participant ? (
        <ParticipantAvatar p={participant} size={36} />
      ) : (
        <Avatar className="size-9">
          <AvatarFallback>{initial}</AvatarFallback>
        </Avatar>
      )}
      <div className="min-w-0 flex-1">
        <strong className="block truncate text-sm text-foreground">{authUser?.name ?? 'LingxiLoop User'}</strong>
        <span className="block truncate text-xs text-muted-foreground">{authUser?.email ?? 'Signed in'}</span>
      </div>
    </div>
  )
}

function GeneralPanel() {
  const { theme, setTheme } = useTheme()
  const muted = useSoundStore((state) => state.muted)
  const setMuted = useSoundStore((state) => state.setMuted)

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="font-heading text-sm font-medium text-foreground">Account</h3>
        <AccountCard />
      </section>
      <section className="space-y-2">
        <h3 className="font-heading text-sm font-medium text-foreground">App</h3>
        <SettingsRow title="Appearance" hint="Choose how LingxiLoop looks on this device.">
          <Select value={theme} onValueChange={(value) => setTheme(value === 'light' ? 'light' : 'dark')}>
            <SelectTrigger size="sm" aria-label="Appearance"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>
        <SettingsRow title="Language" hint="Language used throughout the app.">
          <Badge variant="secondary">English</Badge>
        </SettingsRow>
        <SettingsRow title="Sounds" hint="Play emoticon sounds on this device.">
          <Switch
            aria-label="Sounds"
            checked={!muted}
            onCheckedChange={(checked) => setMuted(!checked)}
          />
        </SettingsRow>
      </section>
    </div>
  )
}

function UpdatesPanel() {
  const { appInfo, status, check } = useUpdater()
  const checking = status.status === 'checking'
  const supported = appInfo?.autoUpdateSupported === true
  const statusText = status.status === 'update-available'
    ? `Version ${status.version ?? 'new'} is available`
    : status.status === 'update-downloaded'
      ? `Version ${status.version ?? 'new'} is ready to install`
      : status.status === 'error'
        ? status.detail ?? 'Update check failed'
        : supported
          ? 'LingxiLoop is up to date'
          : 'Updates are managed by your installation channel'

  const checkForUpdates = () => {
    void toastAction(check(), {
      loading: 'Checking for updates…',
      success: 'Update check finished',
      error: 'Update check failed',
    })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-border bg-card p-4">
        <strong className="block text-sm text-foreground">{statusText}</strong>
        <span className="mt-1 block text-xs text-muted-foreground">
          Current version {appInfo?.version ?? '—'}
        </span>
        <Button
          className="mt-4"
          type="button"
          variant="outline"
          size="sm"
          disabled={!supported || checking}
          onClick={checkForUpdates}
        >
          <HugeiconsIcon icon={RefreshCwIcon} strokeWidth={2} data-icon="inline-start" />
          {checking ? 'Checking…' : 'Check for updates'}
        </Button>
      </div>
      <SettingsRow title="Release channel" hint="LingxiLoop ships through one stable release channel.">
        <Badge variant="secondary">Stable</Badge>
      </SettingsRow>
    </div>
  )
}

export function GrokSettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('general')

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border px-6 py-5 pr-16">
          <DialogTitle>LingxiLoop settings</DialogTitle>
          <DialogDescription>Manage real device and application preferences.</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-[28rem] grid-cols-[12rem_1fr]">
          <nav className="space-y-1 border-r border-border bg-muted/40 p-3" aria-label="Settings sections">
            {SETTINGS_SECTIONS.map((section) => (
              <Button
                key={section.id}
                type="button"
                variant={activeSection === section.id ? 'secondary' : 'ghost'}
                className="w-full justify-start"
                aria-current={activeSection === section.id ? 'page' : undefined}
                onClick={() => setActiveSection(section.id)}
              >
                <HugeiconsIcon icon={section.icon} strokeWidth={2} data-icon="inline-start" />
                {section.label}
              </Button>
            ))}
          </nav>
          <section className="min-w-0 overflow-y-auto p-6">
            <h2 className="mb-4 font-heading text-base font-medium text-foreground">
              {activeSection === 'general' ? 'General' : 'Updates'}
            </h2>
            {activeSection === 'general' ? <GeneralPanel /> : <UpdatesPanel />}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
