import {
  CloudDownloadIcon,
  Database01Icon,
  Notification02Icon,
  PaintBrush01Icon,
  Settings02Icon,
  UserCircleIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar'
import { AccountSettingsPanel } from './AccountSettingsPanel'
import { AppearanceSoundSettingsPanel } from './AppearanceSoundSettingsPanel'
import { DataAccountSettingsPanel } from './DataAccountSettingsPanel'
import { NotificationSettingsPanel } from './NotificationSettingsPanel'
import type { SettingsSectionId } from './store'
import { SETTINGS_DIALOG_TRIGGER_ID, useSettingsDialog } from './store'
import { UpdateSettingsPanel } from './UpdateSettingsPanel'

const SETTINGS_SECTIONS = [
  {
    id: 'account',
    label: '账号',
    description: '查看当前登录账号的资料与验证状态。',
    icon: UserCircleIcon,
  },
  {
    id: 'appearance-sound',
    label: '外观与声音',
    description: '调整这台设备上的主题与消息音效。',
    icon: PaintBrush01Icon,
  },
  {
    id: 'notifications',
    label: '通知',
    description: '管理当前个人学习区或课程的通知偏好。',
    icon: Notification02Icon,
  },
  {
    id: 'updates',
    label: '应用更新',
    description: '查看版本与安装渠道提供的更新。',
    icon: CloudDownloadIcon,
  },
  {
    id: 'data-account',
    label: '数据与账号',
    description: '管理登录状态、账号访问权与身份数据。',
    icon: Database01Icon,
  },
] as const satisfies ReadonlyArray<{
  id: SettingsSectionId
  label: string
  description: string
  icon: typeof UserCircleIcon
}>

function SettingsPanel({ section }: { section: SettingsSectionId }) {
  switch (section) {
    case 'account': return <AccountSettingsPanel />
    case 'appearance-sound': return <AppearanceSoundSettingsPanel />
    case 'notifications': return <NotificationSettingsPanel />
    case 'updates': return <UpdateSettingsPanel />
    case 'data-account': return <DataAccountSettingsPanel />
  }
}

/** Global settings surface. Mount once inside the authenticated desktop shell. */
export function SettingsDialog() {
  const open = useSettingsDialog((state) => state.open)
  const activeSection = useSettingsDialog((state) => state.activeSection)
  const setOpen = useSettingsDialog((state) => state.setOpen)
  const setActiveSection = useSettingsDialog((state) => state.setActiveSection)
  const currentSection = SETTINGS_SECTIONS.find((section) => section.id === activeSection) ?? SETTINGS_SECTIONS[0]

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="h-[min(44rem,calc(100svh-2rem))] grid-rows-[1fr] gap-0 overflow-hidden p-0 sm:max-w-[min(58rem,calc(100vw-2rem))]"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          document.getElementById(SETTINGS_DIALOG_TRIGGER_ID)?.focus()
        }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>LingxiLoop 设置</DialogTitle>
          <DialogDescription>管理账号、设备偏好、当前学习区通知与应用更新。</DialogDescription>
        </DialogHeader>

        <SidebarProvider
          className="h-full min-h-0 bg-popover"
          style={{ '--sidebar-width': '14rem' } as React.CSSProperties}
        >
          <Sidebar
            collapsible="none"
            className="w-14 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground sm:w-[var(--sidebar-width)]"
          >
            <SidebarHeader className="h-14 shrink-0 justify-center border-b border-sidebar-border px-2 sm:px-4">
              <div className="flex items-center justify-center gap-2 sm:justify-start">
                <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} className="size-4 shrink-0" />
                <span className="hidden font-heading text-sm font-medium sm:inline">设置</span>
              </div>
            </SidebarHeader>
            <SidebarContent className="p-2">
              <SidebarMenu aria-label="设置栏目">
                {SETTINGS_SECTIONS.map((section) => (
                  <SidebarMenuItem key={section.id}>
                    <SidebarMenuButton
                      type="button"
                      isActive={activeSection === section.id}
                      className="justify-center px-2 sm:justify-start sm:px-3"
                      aria-current={activeSection === section.id ? 'page' : undefined}
                      aria-label={section.label}
                      onClick={() => setActiveSection(section.id)}
                    >
                      <HugeiconsIcon icon={section.icon} strokeWidth={2} />
                      <span className="hidden sm:inline">{section.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarContent>
          </Sidebar>

          <SidebarInset className="min-h-0 min-w-0 overflow-hidden bg-popover text-popover-foreground">
            <header className="flex h-14 shrink-0 flex-col justify-center border-b border-border px-4 pe-14 sm:px-6 sm:pe-14">
              <h2 className="font-heading text-sm font-medium text-foreground">{currentSection.label}</h2>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{currentSection.description}</p>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              <SettingsPanel section={activeSection} />
            </div>
          </SidebarInset>
        </SidebarProvider>
      </DialogContent>
    </Dialog>
  )
}
