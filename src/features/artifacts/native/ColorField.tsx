import { createContext, lazy, Suspense, useCallback, useContext, useRef, useState } from 'react'
const ColorPopover=lazy(()=>import('./ColorPopover'))
export const EditorPaletteContext=createContext<string[]>([])

export function ColorField({label,value,onChange}:{label:string;value:string;onChange(value:string):void}) {
  const colors=useContext(EditorPaletteContext)
  const button=useRef<HTMLButtonElement>(null),[open,setOpen]=useState(false)
  const close=useCallback(()=>{setOpen(false);button.current?.focus()},[])
  return <div className="native-field native-color-field"><span>{label}</span><button ref={button} type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(v=>!v)}><i className="native-color-swatch" style={{background:value==='none'?undefined:value}} /><span>{value==='none'?'无':value.toUpperCase()}</span></button>{open&&<Suspense fallback={null}><ColorPopover label={label} value={value} colors={colors} anchor={button} onChange={onChange} onClose={close} /></Suspense>}</div>
}
