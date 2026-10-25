// Adapted from Studio Admin, MIT © 2024 Mohammed Arham Khan.
// Fixed source and changes: third_party/studio-admin/README.md.
import { Download, Eye, MoreVertical, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { KnowledgeSource } from '../knowledge/contracts'

export interface FileActionsProps {
  file: KnowledgeSource; readOnly: boolean; busy: boolean
  onOpen(file: KnowledgeSource): void; onDownload(file: KnowledgeSource): void
  onRename(file: KnowledgeSource): void; onDelete(file: KnowledgeSource): void; onRetry(file: KnowledgeSource): void
}
export function FileActions({ file, readOnly, busy, onOpen, onDownload, onRename, onDelete, onRetry }: FileActionsProps) {
  const canRename = !readOnly && file.capabilities?.canRename
  const canDelete = !readOnly && file.capabilities?.canDelete
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" disabled={busy} aria-label={`资料操作：${file.title}`}>
          <MoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-48" align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => onOpen(file)}><Eye />查看资料</DropdownMenuItem>
          {file.capabilities?.canDownload && <DropdownMenuItem onSelect={() => onDownload(file)}><Download />下载原文件</DropdownMenuItem>}
          {canRename && <DropdownMenuItem onSelect={() => onRename(file)}><Pencil />重命名</DropdownMenuItem>}
          {canRename && file.status === 'failed' && <DropdownMenuItem onSelect={() => onRetry(file)}><RotateCcw />重新解析</DropdownMenuItem>}
        </DropdownMenuGroup>
        {canDelete && <><DropdownMenuSeparator /><DropdownMenuGroup>
          <DropdownMenuItem variant="destructive" onSelect={() => onDelete(file)}><Trash2 />删除资料</DropdownMenuItem>
        </DropdownMenuGroup></>}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
