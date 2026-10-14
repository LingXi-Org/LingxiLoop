import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { knowledgeApi } from '@/features/knowledge/api'
import type { KnowledgeSource } from '@/features/knowledge/contracts'
import { userFacingError } from '@/lib/userFacingError'

export function ForumReference({ projectId, sourceId, onClose }: {projectId:string;sourceId:string;onClose():void}) {
  const [source,setSource]=useState<KnowledgeSource>(), [error,setError]=useState('')
  useEffect(()=>{let active=true;void knowledgeApi.getProjectSource(projectId,sourceId).then(value=>{if(active)setSource(value)}).catch(reason=>{if(active)setError(userFacingError(reason,'引用资料无法访问。'))});return()=>{active=false}},[projectId,sourceId])
  return <Dialog open onOpenChange={open=>{if(!open)onClose()}}><DialogContent className="sm:max-w-3xl"><DialogHeader><DialogTitle>{source?.title ?? '作业引用资料'}</DialogTitle><DialogDescription>仅按当前课程权限读取</DialogDescription></DialogHeader>
    {error ? <p role="alert">{error}</p> : !source ? <p role="status">正在加载…</p> : <>
      {source.originalUrl && <a className="text-primary underline" href={source.originalUrl} target="_blank" rel="noreferrer">打开原始网页</a>}
      {source.originalFileUrl && <a className="text-primary underline" href={source.originalFileUrl} target="_blank" rel="noreferrer">打开原始文件</a>}
      <pre className="max-h-[65dvh] overflow-y-auto whitespace-pre-wrap break-words text-sm">{source.extractedText || '资料处理中，完成后可预览内容。'}</pre>
    </>}
  </DialogContent></Dialog>
}
