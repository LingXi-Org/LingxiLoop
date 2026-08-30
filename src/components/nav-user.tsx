import { Button } from '@/components/ui/button'
"use client"

import { ChevronsUpDownIcon, LogOutIcon } from "lucide-react"
import { authApi } from '@/auth/api'
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/stores/auth"
import { resolveUserAvatarUrl } from '@/lib/userAvatar'

export function NavUser({ user }: {
  user: { name: string; email: string; avatar?: string | null }
}) {
  const fallback = user.name.trim().slice(0, 2).toLocaleUpperCase() || "我"
  const avatarUrl = resolveUserAvatarUrl(user.avatar)
  const signOut = () => {
    useAuth.getState().clear()
    void authApi.logout().catch(() => undefined)
  }

  const identity = <>
    <Avatar className="rounded-lg">
      <AvatarImage className="rounded-lg" src={avatarUrl} alt={user.name} />
      <AvatarFallback className="rounded-lg">{fallback}</AvatarFallback>
    </Avatar>
    <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
      <span className="truncate font-medium">{user.name}</span>
      <span className="truncate text-xs">{user.email}</span>
    </div>
  </>

  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button type="button" variant="ghost" className="h-14 w-full justify-start gap-2 rounded-xl px-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground aria-expanded:bg-sidebar-accent aria-expanded:text-sidebar-accent-foreground" aria-label="打开账户菜单">
        {identity}
        <ChevronsUpDownIcon className="ms-auto size-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent className="min-w-64 rounded-lg" side="right" align="end" sideOffset={8}>
      <DropdownMenuGroup>
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">{identity}</div>
        </DropdownMenuLabel>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={signOut}><LogOutIcon />Log out</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
}
