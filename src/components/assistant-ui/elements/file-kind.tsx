import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** One colour and glyph per file type, shared by file cards, previews, sources and deliverables. */
export type FileKind = 'pdf' | 'doc' | 'sheet' | 'slides' | 'image' | 'audio' | 'video' | 'other'

const GLYPHS: Record<FileKind, ReactNode> = {
  pdf: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></>,
  doc: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 12h6M9 15h6M9 18h3" /></>,
  sheet: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 4v16" /></>,
  slides: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /><path d="m7 13 3-3 2 2 4-4" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></>,
  audio: <><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>,
  video: <><rect x="2" y="5" width="15" height="14" rx="2" /><path d="m17 10 5-3v10l-5-3" /></>,
  other: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>,
}

export const FILE_KIND_LABEL: Record<FileKind, string> = {
  pdf: 'PDF', doc: '文档', sheet: '表格', slides: '演示文稿', image: '图片', audio: '音频', video: '视频', other: '其他',
}

export function fileKind(mimeType = '', filename = ''): FileKind {
  const type = mimeType.toLowerCase()
  const ext = filename.toLowerCase().split('.').pop() ?? ''
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('audio/')) return 'audio'
  if (type.startsWith('video/')) return 'video'
  if (/presentation|powerpoint/.test(type) || ['ppt', 'pptx', 'key'].includes(ext)) return 'slides'
  if (/spreadsheet|excel|csv/.test(type) || ['xls', 'xlsx', 'csv', 'tsv'].includes(ext)) return 'sheet'
  if (/word|document|text\/|markdown|rtf/.test(type) || ['doc', 'docx', 'md', 'txt', 'rtf'].includes(ext)) return 'doc'
  return 'other'
}

export function fileExtension(filename: string, mimeType = '') {
  const ext = filename.includes('.') ? filename.split('.').pop() : mimeType.split('/').pop()
  return (ext ?? '').slice(0, 5).toUpperCase()
}

/** Tinted icon well: 40/11 on cards, 28/8 in headers, 24/7 in chips, 12/3 inline. */
export function FileKindIcon({ kind, size = 40, className }: { kind: FileKind; size?: 12 | 18 | 20 | 24 | 28 | 40; className?: string }) {
  const radius = { 12: 3, 18: 5, 20: 6, 24: 7, 28: 8, 40: 11 }[size]
  const glyph = { 12: 6, 18: 10, 20: 11, 24: 12, 28: 14, 40: 18 }[size]
  return <span aria-hidden="true" data-file-kind={kind}
    className={cn('file-kind-icon inline-grid shrink-0 place-items-center', className)}
    style={{ width: size, height: size, borderRadius: radius }}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ width: glyph, height: glyph }}>{GLYPHS[kind]}</svg>
  </span>
}

export function FileExtBadge({ kind, ext }: { kind: FileKind; ext: string }) {
  if (!ext) return null
  return <span data-file-kind={kind} className="file-kind-icon rounded px-[5px] font-mono text-[10.5px] font-medium leading-4">{ext}</span>
}
