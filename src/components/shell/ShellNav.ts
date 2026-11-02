import { createContext, useContext } from 'react'

/** On phones the nested sidebar becomes a sheet; page headers use this to open it. */
export const ShellNavContext = createContext<(() => void) | null>(null)

export const useShellNav = () => useContext(ShellNavContext)
