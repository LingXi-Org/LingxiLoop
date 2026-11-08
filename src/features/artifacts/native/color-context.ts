import {createContext} from 'react'

export const EditorPaletteContext=createContext<string[]>([])
export const EditorColorSessionContext=createContext<()=>void>(()=>{})
