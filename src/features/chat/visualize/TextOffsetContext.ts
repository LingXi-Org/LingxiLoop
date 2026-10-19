import { createContext } from 'react'
/** Original native-message coordinates are preserved when directives split a text part. */
export const TextOffsetContext = createContext<number | null>(null)
