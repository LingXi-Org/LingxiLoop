import { lingxiApiFetch } from '@/api/transport'
import { getActiveCompanyId } from '@/stores/auth'
import { getWorkspaceSession } from '@/lib/workspaceSession'
import type { ArtifactAsset } from '../../../../shared/artifact-document'
import { artifactAssetRequest, requireAssetContentType } from './assets-policy'

export async function fetchArtifactAsset(asset: ArtifactAsset, artifactId: string, signal?: AbortSignal): Promise<Blob> {
  const request = artifactAssetRequest(asset.url, artifactId, location.href)
  const headers: Record<string, string> = {}
  if (request.authenticated) {
    const company = getActiveCompanyId(), workspace = getWorkspaceSession()
    if (company) headers['x-company-id'] = company
    if (workspace && workspace.companyId === company) headers['x-project-id'] = workspace.projectId
  }
  const response = await (request.authenticated ? lingxiApiFetch(request.url, { signal, credentials: 'include', headers, redirect: 'error' }) : fetch(request.url, { signal, credentials: 'omit', redirect: 'error' }))
  if (!response.ok) throw new Error(`资源加载失败 (${response.status})`)
  const type = requireAssetContentType(response.headers.get('content-type'))
  const blob = await response.blob()
  if (blob.size > 20 * 1024 * 1024) throw new Error('资源超过 20 MB。')
  return blob.type === type ? blob : new Blob([blob], { type })
}
