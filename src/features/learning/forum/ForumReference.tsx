import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { MaterialPreview } from '@/features/course-materials/MaterialPreview'
import { knowledgeApi } from '@/features/knowledge/api'
import type { KnowledgeSource } from '@/features/knowledge/contracts'
import { useAuth } from '@/stores/auth'
import { userFacingError } from '@/lib/userFacingError'

export function ForumReference({ projectId, sourceId, onClose }: {projectId:string;sourceId:string;onClose():void}) {
  const [source,setSource]=useState<KnowledgeSource>(), [error,setError]=useState('')
  const companyId=useAuth(state=>state.activeCompanyId), userId=useAuth(state=>state.user?.id)
  useEffect(()=>{let active=true;void knowledgeApi.getProjectSource(projectId,sourceId).then(value=>{if(active)setSource(value)}).catch(reason=>{if(active)setError(userFacingError(reason,'引用资料无法访问。'))});return()=>{active=false}},[projectId,sourceId])
  if (source && companyId && userId) return <MaterialPreview source={source} context={{ companyId, userId, projectId, space: source.visibilityScope === 'PROJECT' ? 'public' : 'private' }} onClose={onClose} />
  return <Dialog open onOpenChange={open=>{if(!open)onClose()}}><DialogContent aria-describedby={undefined}><DialogTitle className="sr-only">引用资料</DialogTitle>{error ? <p role="alert">{error}</p> : <p role="status">正在加载…</p>}</DialogContent></Dialog>
}
