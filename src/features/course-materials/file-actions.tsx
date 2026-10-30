// Adapted from Studio Admin, MIT © 2024 Mohammed Arham Khan.
// Fixed source and changes: third_party/studio-admin/README.md.
import { Download, Eye, MoreVertical, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { KnowledgeSource } from '../knowledge/contracts'
import { useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { ConversationSourceToggle } from '../knowledge/components/ConversationSourceToggle'

export interface FileActionsProps {
  file: KnowledgeSource; readOnly: boolean; busy: boolean; projectId: string
  onOpen(file: KnowledgeSource): void; onDownload(file: KnowledgeSource): void
  onRename(file: KnowledgeSource): void; onDelete(file: KnowledgeSource): void; onRetry(file: KnowledgeSource): void
}
export function FileActions({ file, readOnly, busy, projectId, onOpen, onDownload, onRename, onDelete, onRetry }: FileActionsProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const canRename = !readOnly && file.capabilities?.canRename
  const canDelete = !readOnly && file.capabilities?.canDelete
  return (
    <><DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" disabled={busy} aria-label={`资料操作：${file.title}`}>
          <MoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-48" align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => onOpen(file)}><Eye />查看资料</DropdownMenuItem>
          {file.status === 'ready' && <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>当前对话资料设置</DropdownMenuItem>}
          {file.capabilities?.canDownload && <DropdownMenuItem onSelect={() => onDownload(file)}><Download />下载原文件</DropdownMenuItem>}
          {canRename && <DropdownMenuItem onSelect={() => onRename(file)}><Pencil />重命名</DropdownMenuItem>}
          {canRename && file.status === 'failed' && <DropdownMenuItem onSelect={() => onRetry(file)}><RotateCcw />重新解析</DropdownMenuItem>}
        </DropdownMenuGroup>
        {canDelete && <><DropdownMenuSeparator /><DropdownMenuGroup>
          <DropdownMenuItem variant="destructive" onSelect={() => onDelete(file)}><Trash2 />删除资料</DropdownMenuItem>
        </DropdownMenuGroup></>}
      </DropdownMenuContent>
    </DropdownMenu>
    {settingsOpen && <Dialog open onOpenChange={setSettingsOpen}><DialogContent aria-describedby={undefined}><DialogTitle>当前对话资料设置</DialogTitle><p className="text-sm text-muted-foreground">选择当前课程对话后可设置此资料。</p><ConversationSourceToggle projectId={projectId} sourceId={file.id} /></DialogContent></Dialog>}</>
  )
}
