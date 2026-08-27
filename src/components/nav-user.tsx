"use client"

import { BadgeCheckIcon, BellIcon, ChevronsUpDownIcon, CreditCardIcon, LogOutIcon, SparklesIcon } from "lucide-react"
import { api } from "@/api/client"
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
import { useApp } from "@/stores/app"

export function NavUser({ user }: {
  user: { name: string; email: string; avatar?: string | null }
}) {
  const fallback = user.name.trim().slice(0, 2).toLocaleUpperCase() || "我"
  const signOut = () => {
    useAuth.getState().clear()
    void api.authLogout().catch(() => undefined)
  }
  const openSettings = (tab: 'Profile' | 'Usage' | 'Preferences') => useApp.getState().openSettings(tab)

  const identity = <>
    <Avatar className="rounded-lg">
      {user.avatar ? <AvatarImage className="rounded-lg" src={user.avatar} alt={user.name} /> : null}
      <AvatarFallback className="rounded-lg">{fallback}</AvatarFallback>
    </Avatar>
    <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
      <span className="truncate font-medium">{user.name}</span>
      <span className="truncate text-xs">{user.email}</span>
    </div>
  </>

  return <DropdownMenu>
    <DropdownMenuTrigger render={<button type="button" className="flex w-full items-center gap-2 rounded-lg p-2 text-left transition-colors hover:bg-muted aria-expanded:bg-muted" aria-label="打开账户菜单" />}>
      {identity}
      <ChevronsUpDownIcon className="ml-auto size-4" />
    </DropdownMenuTrigger>
    <DropdownMenuContent className="min-w-64 rounded-lg" side="right" align="end" sideOffset={8}>
      <DropdownMenuGroup>
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">{identity}</div>
        </DropdownMenuLabel>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem onClick={() => openSettings('Usage')}><SparklesIcon />Upgrade to Pro</DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem onClick={() => openSettings('Profile')}><BadgeCheckIcon />Account</DropdownMenuItem>
        <DropdownMenuItem onClick={() => openSettings('Usage')}><CreditCardIcon />Billing</DropdownMenuItem>
        <DropdownMenuItem onClick={() => openSettings('Preferences')}><BellIcon />Notifications</DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={signOut}><LogOutIcon />Log out</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
}
