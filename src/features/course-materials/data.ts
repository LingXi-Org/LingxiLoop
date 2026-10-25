// Adapted from Studio Admin, MIT © 2024 Mohammed Arham Khan.
// Fixed source and changes: third_party/studio-admin/README.md.
import { File, FileArchive, FileChartColumn, FileImage, FileText, Globe, Presentation } from 'lucide-react'
import type { KnowledgeSource } from '../knowledge/contracts'

export type MaterialSpace = 'public' | 'private'
export interface MaterialContext { companyId: string; userId: string; projectId: string; space: MaterialSpace }
export const materialQueryKey = (context: MaterialContext) => ['course-materials', context.companyId, context.userId, context.projectId, context.space] as const
export type FileKind = 'pdf' | 'document' | 'presentation' | 'spreadsheet' | 'markdown' | 'text' | 'image' | 'archive' | 'web' | 'unknown'
export const fileIcons = {
  archive: FileArchive, image: FileImage, document: FileText, pdf: File, spreadsheet: FileChartColumn,
  presentation: Presentation, markdown: FileText, text: FileText, web: Globe, unknown: File,
} satisfies Record<FileKind, typeof File>
export const fileKindLabels: Record<FileKind, string> = {
  archive: '压缩包', image: '图片', document: 'Word', pdf: 'PDF', spreadsheet: 'Excel / CSV',
  presentation: 'PPT', markdown: 'Markdown', text: '文本 / JSON', web: '网页', unknown: '其他',
}
export const materialMimes: Record<string, string> = {
  pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  md: 'text/markdown', txt: 'text/plain', csv: 'text/csv', json: 'application/json',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', zip: 'application/zip',
}
export function fileKind(file: Pick<KnowledgeSource, 'title' | 'mimeType' | 'kind'>): FileKind {
  if (file.kind === 'url') return 'web'
  const mime = file.mimeType?.toLowerCase() ?? ''
  const ext = file.title.split('.').at(-1)?.toLowerCase() ?? ''
  if (mime === 'application/pdf') return 'pdf'
  if (mime.startsWith('image/')) return 'image'
  if (/wordprocessingml|msword/.test(mime)) return 'document'
  if (/presentation|powerpoint/.test(mime)) return 'presentation'
  if (/spreadsheet|excel|csv/.test(mime)) return 'spreadsheet'
  if (/zip|compressed|archive/.test(mime)) return 'archive'
  if (mime === 'text/markdown') return 'markdown'
  if (mime === 'text/plain' || mime === 'application/json') return 'text'
  return ({ pdf: 'pdf', doc: 'document', docx: 'document', ppt: 'presentation', pptx: 'presentation',
    xls: 'spreadsheet', xlsx: 'spreadsheet', csv: 'spreadsheet', md: 'markdown', txt: 'text', json: 'text',
    jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image', zip: 'archive', rar: 'archive' } as Record<string, FileKind>)[ext] ?? 'unknown'
}
export type MaterialFormat = 'all' | FileKind
export type MaterialSort = 'modified-desc' | 'modified-asc' | 'name-asc' | 'name-desc' | 'size-desc' | 'size-asc'
export const materialSortLabels: Record<MaterialSort, string> = {
  'modified-desc': '修改时间：由新到旧', 'modified-asc': '修改时间：由旧到新',
  'name-asc': '名称：A–Z', 'name-desc': '名称：Z–A', 'size-desc': '大小：由大到小', 'size-asc': '大小：由小到大',
}
export function filterAndSortFiles(files: KnowledgeSource[], search: string, format: MaterialFormat, sort: MaterialSort) {
  const query = search.trim().toLocaleLowerCase()
  return files.filter(file => (format === 'all' || fileKind(file) === format)
    && `${file.title} ${file.ownerName ?? ''}`.toLocaleLowerCase().includes(query)).sort((a, b) => {
    const direction = sort.endsWith('-asc') ? 1 : -1
    const value = sort.startsWith('name') ? a.title.localeCompare(b.title, 'zh-CN', { numeric: true })
      : sort.startsWith('size') ? a.sizeBytes - b.sizeBytes
        : (Date.parse(a.updatedAt) || 0) - (Date.parse(b.updatedAt) || 0)
    return value * direction || a.id.localeCompare(b.id)
  })
}
export function sizeLabel(bytes: number) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}
export const dateLabel = (date: string) => new Date(date).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
export function sourceStatusLabel(source: KnowledgeSource) {
  if (source.status === 'stored' || source.stage === 'stored_only') return '仅保存原文件'
  return ({ upload_pending: '等待上传完成', queued: '等待解析', processing: '正在解析', ready: '可查看', failed: source.kind === 'file' && source.capabilities?.canDownload ? '原文件已保存 · 内容解析失败' : '内容解析失败' })[source.status] ?? '状态暂不可用'
}
