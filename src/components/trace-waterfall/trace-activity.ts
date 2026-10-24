import { createContext } from 'react'

/** Standalone traces are visible by default; disclosures own their open state. */
export const TraceActivity = createContext(true)
