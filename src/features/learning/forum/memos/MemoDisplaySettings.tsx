// Adapted from usememos/memos 8120a6c web/src/components/MemoDisplaySettingMenu.tsx (MIT).
// Product adapters: existing controls, course query fields and local display preferences.
import { useState } from 'react'
import { SlidersHorizontalIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SelectField } from '@/components/ui/select-field'
import { Switch } from '@/components/ui/switch'
export interface ForumDisplay { columns:'1'|'2'|'3'|'0';compact:boolean;order:'desc'|'asc';timeBasis:'created'|'updated' }
const defaults:ForumDisplay={columns:'1',compact:false,order:'desc',timeBasis:'created'}
const key='lingxiloop-forum-display'
export function useForumDisplay(){
  const [display,setDisplay]=useState<ForumDisplay>(()=>{
    try {const value=JSON.parse(localStorage.getItem(key)??'null');return value && ['1','2','3','0'].includes(value.columns) && typeof value.compact==='boolean' && ['desc','asc'].includes(value.order) && ['created','updated'].includes(value.timeBasis)?value:defaults}catch{return defaults}
  })
  return [display,(next:ForumDisplay)=>{setDisplay(next);try{localStorage.setItem(key,JSON.stringify(next))}catch{/* Display preferences are optional. */}}] as const
}
export function MemoDisplaySettings({value,onChange}:{value:ForumDisplay;onChange(value:ForumDisplay):void}){
  const compactLocked=value.columns!=='1'
  return <Popover><PopoverTrigger asChild><Button variant="ghost" size="sm" aria-label="内容流显示设置"><SlidersHorizontalIcon className="size-4"/>显示设置</Button></PopoverTrigger><PopoverContent className="w-72 space-y-4" aria-label="内容流显示设置">
    <div className="grid grid-cols-4 gap-1" role="group" aria-label="内容流布局">{[['1','单列'],['2','双列'],['3','三列'],['0','自动']].map(([columns,label])=><Button key={columns} size="sm" variant={columns===value.columns?'secondary':'ghost'} aria-pressed={columns===value.columns} onClick={()=>onChange({...value,columns:columns as ForumDisplay['columns']})}>{label}</Button>)}</div>
    <SelectField ariaLabel="排序时间" value={value.timeBasis} onValueChange={timeBasis=>onChange({...value,timeBasis:timeBasis as ForumDisplay['timeBasis']})} options={[{value:'created',label:'发布时间'},{value:'updated',label:'更新时间'}]}/>
    <SelectField ariaLabel="时间顺序" value={value.order} onValueChange={order=>onChange({...value,order:order as ForumDisplay['order']})} options={[{value:'desc',label:'最新在前'},{value:'asc',label:'最早在前'}]}/>
    <label className="flex items-center justify-between gap-3 text-sm">紧凑显示<Switch aria-label="紧凑显示" checked={compactLocked||value.compact} disabled={compactLocked} onCheckedChange={compact=>onChange({...value,compact})}/></label>
  </PopoverContent></Popover>
}
