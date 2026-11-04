import { createContext, useContext, type ReactNode } from 'react'

/** On phones the nested sidebar becomes a sheet; page headers use this to open it. */
export const ShellNavContext = createContext<(() => void) | null>(null)
export const ShellNavTriggerContext = createContext<ReactNode>(null)

export const useShellNav = () => useContext(ShellNavContext)
export const useShellNavTrigger = () => useContext(ShellNavTriggerContext)
