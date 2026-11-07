import type { ArtifactPage } from '../../../../shared/artifact-document'
import type { ArtifactExportFormat } from './export-artifact'
import { Menu, MenuItem } from './EditorPrimitives'

export interface BoardExportChoice {
  pageIds: string[]
  title?: string
  pixelRatio?: 1 | 2
  htmlArchive?: boolean
}
export function BoardExportMenu({ page, allPageIds, selectedPageIds, busy, onExport }: {
  page: ArtifactPage
  allPageIds: string[]
  selectedPageIds: string[]
  busy: boolean
  onExport(format: ArtifactExportFormat, choice: BoardExportChoice): void
}) {
  const one = { pageIds: [page.id], title: page.title }
  return <Menu className="native-board-export-menu" label={`导出画板 ${page.title}`} icon="download" align="end" disabled={busy} minimumWidth={190}>
    <MenuItem onClick={() => onExport('png', { ...one, pixelRatio: 1 })}>透明位图 · 原始尺寸<small>{page.width} × {page.height} 像素</small></MenuItem>
    <MenuItem onClick={() => onExport('png', { ...one, pixelRatio: 2 })}>透明位图 · 双倍尺寸<small>{page.width * 2} × {page.height * 2} 像素</small></MenuItem>
    <MenuItem onClick={() => onExport('pdf', one)}>便携文档<small>以当前画板尺寸导出一页</small></MenuItem>
    <MenuItem onClick={() => onExport('html', { ...one, htmlArchive: true })}>网页压缩包<small>包含可离线打开的画板网页</small></MenuItem>
    <hr />
    <MenuItem onClick={() => onExport('pdf', { pageIds: allPageIds })}>全部画板 · 便携文档<small>按画布位置排列</small></MenuItem>
    <MenuItem disabled={selectedPageIds.length<2} onClick={() => onExport('pdf', { pageIds: selectedPageIds })}>所选画板 · 便携文档</MenuItem>
  </Menu>
}
