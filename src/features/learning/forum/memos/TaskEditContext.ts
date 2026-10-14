// Course-author adapter for Memos markdown/List task checkbox editing (MIT).
import { createContext } from 'react'
export const TaskEditContext = createContext<((line: number) => void) | undefined>(undefined)
