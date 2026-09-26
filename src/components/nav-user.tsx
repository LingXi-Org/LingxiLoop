import { Logout03Icon, Settings02Icon, UnfoldMoreIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { authApi } from '@/auth/api'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { openSettingsDialog, SETTINGS_DIALOG_TRIGGER_ID } from '@/features/settings/store'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { resolveUserAvatarUrl } from '@/lib/userAvatar'
import { useAuth } from '@/stores/auth'

export function NavUser({ user, compact = false }: {
  user: { id: string; name: string; email: string; avatar?: string | null }
  compact?: boolean
}) {
  const isMobile = useIsMobile()
  const isCompanyAdmin = useAuth((state) => state.companies[0]?.isAdmin === true)
  const fallback = user.name.trim().slice(0, 2).toLocaleUpperCase() || '我'
  const avatarUrl = resolveUserAvatarUrl(user.avatar, user.id)
  const signOut = () => {
    useAuth.getState().clear()
    void authApi.signOut().catch(() => undefined)
  }

  const identity = <>
    <Avatar size={isMobile ? 'sm' : 'default'} className="rounded-lg">
      <AvatarImage className="rounded-lg" src={avatarUrl} alt={user.name} />
      <AvatarFallback className="rounded-lg">{fallback}</AvatarFallback>
    </Avatar>
    <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
      <span className="truncate font-medium">{user.name}</span>
      <span className="truncate text-xs">{user.email}</span>
    </div>
  </>

  const accountButton = <Button id={SETTINGS_DIALOG_TRIGGER_ID} type="button" variant="ghost" className={cn('justify-start gap-2 rounded-xl text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground aria-expanded:bg-sidebar-accent aria-expanded:text-sidebar-accent-foreground', compact ? 'size-11 justify-center p-1' : isMobile ? 'h-12 w-full px-2' : 'h-14 w-full px-2')} aria-label="打开账户菜单" title={compact ? `${user.name} · 账户与设置` : undefined}>
    {compact ? <Avatar className="size-8 rounded-lg"><AvatarImage className="rounded-lg" src={avatarUrl} alt={user.name} /><AvatarFallback className="rounded-lg">{fallback}</AvatarFallback></Avatar> : identity}
    {!compact && <HugeiconsIcon icon={UnfoldMoreIcon} strokeWidth={2} className="ms-auto size-4" />}
  </Button>

  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      {accountButton}
    </DropdownMenuTrigger>
    <DropdownMenuContent className="min-w-64 max-w-[calc(100vw-24px)] rounded-lg" side={compact ? 'right' : isMobile ? 'top' : 'right'} align="end" sideOffset={8} collisionPadding={12}>
      <DropdownMenuGroup>
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">{identity}</div>
        </DropdownMenuLabel>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      {isCompanyAdmin && <DropdownMenuItem asChild><a href={import.meta.env.DEV ? 'http://localhost:5198' : 'https://admin.lingxilearn.cn'} target="_blank" rel="noopener noreferrer">管理后台</a></DropdownMenuItem>}
      <DropdownMenuItem onSelect={() => openSettingsDialog()}>
        <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} />
        设置
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={signOut}>
        <HugeiconsIcon icon={Logout03Icon} strokeWidth={2} />
        退出登录
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
}
