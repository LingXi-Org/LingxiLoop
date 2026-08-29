import { http } from '@/api/core/http'
import type { ProjectStatus } from '@/types'

export interface ProjectLifecycleResult {
  ok: true
  status: ProjectStatus
  applied: boolean
}

function command(projectId: string, path: string) {
  return http<ProjectLifecycleResult>(`/projects/${encodeURIComponent(projectId)}/${path}`, { method: 'POST' })
}

export const projectLifecycleApi = {
  activate: (projectId: string) => command(projectId, 'activate'),
  end: (projectId: string) => command(projectId, 'end'),
  enterReadOnly: (projectId: string) => command(projectId, 'enter-read-only'),
  requestTransfer: (projectId: string) => command(projectId, 'request-transfer'),
  cancelTransfer: (projectId: string) => command(projectId, 'cancel-transfer'),
  enterRetention: (projectId: string) => command(projectId, 'enter-retention'),
  archive: (projectId: string) => command(projectId, 'archive'),
  delete: (projectId: string) => http<ProjectLifecycleResult>(
    `/projects/${encodeURIComponent(projectId)}`,
    { method: 'DELETE' },
  ),
}
