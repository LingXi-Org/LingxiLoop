// Adapted from Studio Admin, MIT © 2024 Mohammed Arham Khan.
// Fixed source and changes: third_party/studio-admin/README.md.
import { ArrowDown, ArrowUp, LoaderCircle } from 'lucide-react'
import { AccountAvatar } from '@/components/AccountAvatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { KnowledgeSource } from '../knowledge/contracts'
import { dateLabel, fileIcons, fileKind, fileKindLabels, type MaterialSort, sizeLabel, sourceStatusLabel } from './data'
import { FileActions, type FileActionsProps } from './file-actions'

interface FileListViewProps extends Omit<FileActionsProps, 'file' | 'busy'> {
  files: KnowledgeSource[]; publicSpace: boolean; selected: Set<string>; busyIds: Set<string>; sort: MaterialSort
  onSelect(id: string, selected: boolean): void; onSelectAll(selected: boolean): void; onSort(value: MaterialSort): void
}
export function FileListView({ files, publicSpace, selected, busyIds, sort, onSelect, onSelectAll, onSort, ...actions }: FileListViewProps) {
  const allSelected = files.length > 0 && files.every(file => selected.has(file.id))
  const sortHead = (column: 'name' | 'modified' | 'size', label: string) => <Button variant="ghost" size="sm" className="-ms-2 gap-1 px-2 text-xs text-muted-foreground" onClick={() => onSort(`${column}-${sort === `${column}-asc` ? 'desc' : 'asc'}`)}>
    {label}{sort.startsWith(column) && (sort.endsWith('asc') ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
  </Button>
  const ariaSort = (column: string) => sort.startsWith(column) ? sort.endsWith('asc') ? 'ascending' as const : 'descending' as const : undefined
  return (
    <Table aria-label="课程资料列表" className="min-w-[680px]">
      <TableHeader>
        <TableRow className="bg-muted/25 hover:bg-muted/25">
          <TableHead className="w-12 ps-4"><Checkbox aria-label="选择当前列表全部资料" checked={allSelected ? true : selected.size > 0 ? 'indeterminate' : false} onCheckedChange={checked => onSelectAll(checked === true)} /></TableHead>
          <TableHead className="min-w-56" aria-sort={ariaSort('name')}>{sortHead('name', '文件名称')}</TableHead>
          <TableHead className="text-xs text-muted-foreground">格式</TableHead>
          {publicSpace && <TableHead className="text-xs text-muted-foreground">上传教师</TableHead>}
          <TableHead aria-sort={ariaSort('modified')}>{sortHead('modified', '修改时间')}</TableHead>
          <TableHead aria-sort={ariaSort('size')}>{sortHead('size', '大小')}</TableHead>
          <TableHead className="w-16"><span className="sr-only">资料操作</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {files.map(file => {
          const kind = fileKind(file)
          const FileIcon = fileIcons[kind]
          const busy = busyIds.has(file.id)
          const owner = file.ownerName || '课程教师'
          return (
            <TableRow key={file.id} data-state={selected.has(file.id) ? 'selected' : undefined}>
              <TableCell className="ps-4"><Checkbox aria-label={`选择：${file.title}`} checked={selected.has(file.id)} onCheckedChange={checked => onSelect(file.id, checked === true)} /></TableCell>
              <TableCell>
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted/60"><FileIcon className="size-5 text-muted-foreground" /></span>
                  <div className="min-w-0">
                    <Button variant="link" size="sm" className="h-auto max-w-72 justify-start px-0 text-foreground" aria-label={`查看资料：${file.title}`} onClick={() => actions.onOpen(file)}><span className="truncate">{file.title}</span></Button>
                    <span className={`mt-1 block text-xs ${file.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}>{busy && <LoaderCircle className="me-1 inline size-3 animate-spin motion-reduce:animate-none" />}{sourceStatusLabel(file)}</span>
                  </div>
                </div>
              </TableCell>
              <TableCell><Badge variant="outline" className="font-normal text-muted-foreground">{fileKindLabels[kind]}</Badge></TableCell>
              {publicSpace && <TableCell><div className="flex items-center gap-2"><AccountAvatar userId={file.ownerUserId} name={owner} url={file.ownerAvatarUrl} /><span className="max-w-32 truncate">{owner}</span></div></TableCell>}
              <TableCell className="text-xs tabular-nums text-muted-foreground"><time dateTime={file.updatedAt}>{dateLabel(file.updatedAt)}</time></TableCell>
              <TableCell className="text-xs tabular-nums text-muted-foreground">{sizeLabel(file.sizeBytes)}</TableCell>
              <TableCell><div className="flex items-center justify-end"><FileActions file={file} busy={busy} {...actions} /></div></TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
