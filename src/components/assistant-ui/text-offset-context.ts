import { createContext } from 'react'

/** Original message coordinates survive display slices and archived placeholders. */
export const TextOffsetContext = createContext<number | null>(null)
