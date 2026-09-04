import {
  Cancel01Icon,
  Database01Icon,
  Logout03Icon,
  Notification02Icon,
  PaintBrush01Icon,
  Settings02Icon,
  UserCircleIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useIsMobile } from '@/hooks/use-mobile'
import { AccountSettingsPanel } from './AccountSettingsPanel'
import { AppearanceSoundSettingsPanel } from './AppearanceSoundSettingsPanel'
import { DataAccountSettingsPanel } from './DataAccountSettingsPanel'
import { NotificationSettingsPanel } from './NotificationSettingsPanel'
import type { SettingsSectionId } from './store'
import { SETTINGS_DIALOG_TRIGGER_ID, useSettingsDialog } from './store'

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
    case 'data-account': return <DataAccountSettingsPanel />
  }
}

/** Global settings surface. Mount once inside the authenticated desktop shell. */
export function SettingsDialog() {
  const isMobile = useIsMobile()
  const open = useSettingsDialog((state) => state.open)
  const activeSection = useSettingsDialog((state) => state.activeSection)
  const setOpen = useSettingsDialog((state) => state.setOpen)
  const setActiveSection = useSettingsDialog((state) => state.setActiveSection)
  const currentSection = SETTINGS_SECTIONS.find((section) => section.id === activeSection) ?? SETTINGS_SECTIONS[0]

  if (isMobile) return (
    <Drawer
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) window.requestAnimationFrame(() => document.getElementById(SETTINGS_DIALOG_TRIGGER_ID)?.focus())
      }}
      direction="bottom"
    >
      <DrawerContent className="h-[min(88dvh,44rem)] max-h-[88dvh] overflow-hidden p-0 pb-[env(safe-area-inset-bottom)] before:inset-x-0 before:bottom-0 before:top-2 before:rounded-b-none">
        <Tabs
          value={activeSection}
          onValueChange={(value) => setActiveSection(value as SettingsSectionId)}
          className="min-h-0 flex-1 gap-0"
        >
          <DrawerHeader className="shrink-0 border-b border-border px-5 pb-3 pt-3 text-start">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <DrawerTitle>{currentSection.label}</DrawerTitle>
                <DrawerDescription className="mt-0.5 truncate text-xs">{currentSection.description}</DrawerDescription>
              </div>
              <DrawerClose asChild>
                <Button type="button" variant="ghost" size="icon-sm" className="shrink-0 rounded-full" aria-label="关闭设置">
                  <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                </Button>
              </DrawerClose>
            </div>
          </DrawerHeader>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {SETTINGS_SECTIONS.map((section) => (
              <TabsContent key={section.id} value={section.id} className="m-0">
                <SettingsPanel section={section.id} />
              </TabsContent>
            ))}
          </div>

          <div className="flex shrink-0 justify-center bg-popover px-3 pb-2 pt-2">
            <TabsList aria-label="设置栏目" className="h-13 rounded-full p-1">
              {SETTINGS_SECTIONS.map((section) => {
                const mobileLabel = section.id === 'data-account' ? '退出登录与账号' : section.label
                return <TabsTrigger
                  key={section.id}
                  value={section.id}
                  className="size-11 flex-none rounded-full p-0"
                  aria-label={mobileLabel}
                  title={mobileLabel}
                >
                  <HugeiconsIcon icon={section.id === 'data-account' ? Logout03Icon : section.icon} strokeWidth={2} />
                  <span className="sr-only">{mobileLabel}</span>
                </TabsTrigger>
              })}
            </TabsList>
          </div>
        </Tabs>
      </DrawerContent>
    </Drawer>
  )

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
          <DialogDescription>管理账号、设备偏好与当前学习区通知。</DialogDescription>
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
