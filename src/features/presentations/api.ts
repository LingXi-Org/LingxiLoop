import { API, http } from '@/api/core/http'
import { lingxiApiFetch } from '@/api/transport'
import { getWorkspaceSession } from '@/lib/workspaceSession'
import { getActiveCompanyId, getAuthToken, useAuth } from '@/stores/auth'
import {
  parsePresentationDetail,
  parsePresentationVersionList,
  type PresentationDetailV1,
  type PresentationResourceV1,
  type PresentationVersionSummaryV1,
} from './contracts'

function presentationPath(id: string): string {
  return `/presentations/${encodeURIComponent(id)}`
}

async function responseError(response: Response): Promise<Error> {
  try {
    const text = await response.text()
    if (!text) return new Error(`请求失败（${response.status}）`)
    try {
      const json = JSON.parse(text) as { error?: string; message?: string }
      return new Error(json.error ?? json.message ?? `请求失败（${response.status}）`)
    } catch {
      return new Error(text.slice(0, 200))
    }
  } catch {
    return new Error(`请求失败（${response.status}）`)
  }
}

async function fetchPresentationHtml(path: string, signal?: AbortSignal): Promise<Blob> {
  const headers = new Headers({ accept: 'text/html' })
  const token = getAuthToken()
  if (token) headers.set('authorization', `Bearer ${token}`)
  const companyId = getActiveCompanyId()
  if (companyId) headers.set('x-company-id', companyId)
  const workspace = getWorkspaceSession()
  if (workspace && workspace.companyId === companyId) headers.set('x-project-id', workspace.projectId)

  const response = await lingxiApiFetch(`${API}${path}`, { headers, signal })
  if (response.status === 401) useAuth.getState().clear()
  if (!response.ok) throw await responseError(response)
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('text/html')) throw new Error('演示文件格式无效')
  return response.blob()
}

async function getPresentation(id: string): Promise<PresentationDetailV1> {
  return parsePresentationDetail(await http<unknown>(presentationPath(id)))
}

async function getPresentationVersions(id: string): Promise<PresentationVersionSummaryV1[]> {
  const payload = await http<unknown>(`${presentationPath(id)}/versions`)
  return parsePresentationVersionList(payload).versions
}

export const presentationsApi = {
  get: getPresentation,

  getVersions: getPresentationVersions,

  async getResource(id: string): Promise<PresentationResourceV1> {
    const [presentation, versions] = await Promise.all([
      getPresentation(id),
      getPresentationVersions(id),
    ])
    return { presentation, versions }
  },

  async approveOutline(id: string, expectedRevision: number): Promise<PresentationDetailV1> {
    const payload = await http<unknown>(`${presentationPath(id)}/outline/approve`, {
      method: 'POST',
      body: JSON.stringify({ expectedRevision }),
    })
    return parsePresentationDetail(payload)
  },

  async cancel(id: string): Promise<PresentationDetailV1> {
    return parsePresentationDetail(await http<unknown>(`${presentationPath(id)}/cancel`, { method: 'POST' }))
  },

  async retry(id: string): Promise<PresentationDetailV1> {
    return parsePresentationDetail(await http<unknown>(`${presentationPath(id)}/retry`, { method: 'POST' }))
  },

  getVersionContent(id: string, versionId: string, signal?: AbortSignal): Promise<Blob> {
    return fetchPresentationHtml(
      `${presentationPath(id)}/versions/${encodeURIComponent(versionId)}/content`,
      signal,
    )
  },

  getVersionDownload(id: string, versionId: string, signal?: AbortSignal): Promise<Blob> {
    return fetchPresentationHtml(
      `${presentationPath(id)}/versions/${encodeURIComponent(versionId)}/download`,
      signal,
    )
  },
}
