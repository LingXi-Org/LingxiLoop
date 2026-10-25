import { create } from 'zustand'
import { knowledgeApi } from '../knowledge/api'
import { useAuth } from '@/stores/auth'
import { registerAuthTeardown } from '@/stores/authTeardown'
import { userFacingError } from '@/lib/userFacingError'
import { type MaterialContext, materialQueryKey } from './data'
import { materialsQueryClient } from './queries'

export interface MaterialUpload {
  id: string; context: MaterialContext; file: File
  status: 'uploading' | 'saved' | 'failed'; progress: number; error?: string
}
interface UploadsState { items: MaterialUpload[]; add(files: File[], context: MaterialContext): void; retry(id: string): void; dismiss(id: string): void }

async function startUpload(item: MaterialUpload) {
  const { companyId, userId, projectId, space } = item.context
  const epoch = useAuth.getState().authorizationEpoch
  const isCurrentIdentity = () => {
    const auth = useAuth.getState()
    return auth.user?.id === userId && auth.activeCompanyId === companyId && auth.authorizationEpoch === epoch
  }
  const update = (changes: Partial<MaterialUpload>) => useMaterialUploads.setState(state => ({
    items: state.items.map(entry => entry.id === item.id ? { ...entry, ...changes } : entry),
  }))
  try {
    await knowledgeApi.uploadProjectMaterial(projectId, item.file, { companyId, userId, space, isCurrentIdentity },
      progress => update({ progress }))
    update({ status: 'saved', progress: 100 })
  } catch (error) {
    update({ status: 'failed', error: userFacingError(error, error instanceof Error && /^文件(超过|格式)/.test(error.message) ? error.message : '文件上传失败，请重试。') })
  } finally {
    if (isCurrentIdentity()) await materialsQueryClient.invalidateQueries({ queryKey: materialQueryKey(item.context) })
  }
}
export const useMaterialUploads = create<UploadsState>((set, get) => ({
  items: [],
  add(files, context) {
    const items = files.map(file => ({ id: crypto.randomUUID(), context, file, status: 'uploading' as const, progress: 0 }))
    set(state => ({ items: [...state.items, ...items] }))
    for (const item of items) void startUpload(item)
  },
  retry(id) {
    const item = get().items.find(entry => entry.id === id && entry.status === 'failed')
    if (!item) return
    set(state => ({ items: state.items.map(entry => entry.id === id ? { ...entry, status: 'uploading', progress: 0, error: undefined } : entry) }))
    void startUpload(item)
  },
  dismiss(id) { set(state => ({ items: state.items.filter(entry => entry.id !== id || entry.status === 'uploading') })) },
}))
registerAuthTeardown(() => useMaterialUploads.setState({ items: [] }))
