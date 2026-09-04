import { Archive02Icon, Delete02Icon, Edit02Icon, Folder01Icon, PlusSignIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useMemo, useState } from 'react'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { LearningSpace } from '@/features/learning/contracts'
import { DashboardSectionFrame } from '@/features/learning/dashboard/DashboardSectionFrame'
import { toastAction } from '@/lib/actionToast'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import { userFacingError } from '@/lib/userFacingError'
import type { WorkspaceSummary } from '@/types'
import { knowledgeApi } from '../api'
import { useWorkspace } from '../workspace'
import { ProjectSourceLibrary } from './ProjectSourceLibrary'

type FolderEditor = { mode: 'create' } | { mode: 'rename'; workspace: WorkspaceSummary }

interface SourceFolder {
  id: string
  kind: WorkspaceSummary['kind']
  name: string
  description: string
  status: WorkspaceSummary['status']
  isDefault: boolean
  sourceCount?: number
  perspective?: LearningSpace['perspective']
  workspace?: WorkspaceSummary
}

function folderKind(folder: SourceFolder): string {
  if (folder.kind === 'PERSONAL_LEARNING') return folder.isDefault ? '默认工作区' : '个人工作区'
  if (folder.kind === 'TEACHING') return folder.perspective === 'teacher' ? '我的课程' : '加入的课程'
  return '机构课程'
}

function canManageFolder(workspace: WorkspaceSummary): boolean {
  return workspace.canManage && workspace.kind === 'PERSONAL_LEARNING'
}

export function PersonalSourceDrive({ space, spaces, onOpenLearningSpace }: {
  space: LearningSpace
  spaces: LearningSpace[]
  onOpenLearningSpace(projectId: string): void
}) {
  const workspaces = useWorkspace((state) => state.list)
  const loaded = useWorkspace((state) => state.loaded)
  const loading = useWorkspace((state) => state.loading)
  const load = useWorkspace((state) => state.load)
  const storeError = useWorkspace((state) => state.error)
  const [openFolderId, setOpenFolderId] = useState<string | null>(null)
  const [editor, setEditor] = useState<FolderEditor | null>(null)

  useEffect(() => { if (!loaded && !loading) void load() }, [load, loaded, loading])

  const folders = useMemo(() => {
    const byId = new Map<string, SourceFolder>()
    for (const space of spaces) {
      if (space.status === 'DELETED') continue
      byId.set(space.projectId, {
        id: space.projectId,
        kind: space.projectKind,
        name: space.title,
        description: space.description,
        status: space.status,
        isDefault: space.isDefault,
        perspective: space.perspective,
      })
    }
    for (const workspace of workspaces) {
      if (workspace.status === 'DELETED') continue
      byId.set(workspace.id, {
        ...byId.get(workspace.id),
        id: workspace.id,
        kind: workspace.kind,
        name: workspace.name,
        description: workspace.description,
        status: workspace.status,
        isDefault: workspace.isDefault,
        sourceCount: workspace.sourceCount,
        workspace,
      })
    }
    return [...byId.values()].sort((left, right) =>
      Number(left.kind !== 'PERSONAL_LEARNING') - Number(right.kind !== 'PERSONAL_LEARNING')
        || Number(right.isDefault) - Number(left.isDefault)
        || Number(left.status === 'ARCHIVED') - Number(right.status === 'ARCHIVED')
        || left.name.localeCompare(right.name, 'zh-CN'))
  }, [spaces, workspaces])
  const openFolder = workspaces.find((workspace) => workspace.id === openFolderId) ?? null

  const open = (folder: SourceFolder) => {
    if (folder.kind === 'PERSONAL_LEARNING' && folder.workspace) setOpenFolderId(folder.id)
    else onOpenLearningSpace(folder.id)
  }

  const archiveFolder = async (workspace: WorkspaceSummary) => {
    if (!await confirmSensitiveAction({
      title: '归档工作区文件夹？',
      description: `“${workspace.name}”会从日常工作区中归档，资料不会立即删除。`,
      confirmLabel: '归档文件夹',
      tone: 'destructive',
    })) return
    try {
      await toastAction(knowledgeApi.archiveProject(workspace.id), {
        loading: '正在归档文件夹', success: '文件夹已归档', error: '归档文件夹失败',
      })
      await load()
    } catch { /* Toast owns the visible error state. */ }
  }

  const deleteFolder = async (workspace: WorkspaceSummary) => {
    if (!await confirmSensitiveAction({
      title: '永久删除工作区文件夹？',
      description: `“${workspace.name}”及其中的资料将被永久删除，此操作无法撤销。`,
      confirmLabel: '永久删除',
      tone: 'destructive',
    })) return
    try {
      const deletion = (async () => {
        if (workspace.status !== 'ARCHIVED') await knowledgeApi.archiveProject(workspace.id)
        return knowledgeApi.deleteProject(workspace.id)
      })()
      await toastAction(deletion, {
        loading: '正在删除文件夹', success: '文件夹已删除', error: '删除文件夹失败',
      })
      if (openFolderId === workspace.id) setOpenFolderId(null)
      await load()
    } catch { /* Toast owns the visible error state. */ }
  }

  if (openFolder) {
    const closeFolder = () => { setOpenFolderId(null); void load() }
    return <DashboardSectionFrame space={space} section="resources" breadcrumb={{ root: '个人学习资料', current: openFolder.name, onBack: closeFolder }}>
      <ProjectSourceLibrary projectId={openFolder.id} canManage={openFolder.canManage} />
    </DashboardSectionFrame>
  }

  return <DashboardSectionFrame space={space} section="resources"><div className="space-y-5">
    <div className="flex justify-end">
      <Button type="button" onClick={() => setEditor({ mode: 'create' })}>
        <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />新建文件夹
      </Button>
    </div>
    <div>
      {loading && folders.length === 0 ? <ResourceSkeleton variant="cards" count={6} label="正在加载工作区资料夹" />
        : storeError && folders.length === 0 ? <Alert variant="destructive"><AlertDescription>{storeError}</AlertDescription></Alert>
          : folders.length === 0 ? <Empty className="min-h-96 border border-dashed">
            <EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={Folder01Icon} strokeWidth={2} /></EmptyMedia><EmptyTitle>还没有工作区文件夹</EmptyTitle><EmptyDescription>创建文件夹后即可上传资料并建立独立知识索引。</EmptyDescription></EmptyHeader>
            <EmptyContent><Button type="button" onClick={() => setEditor({ mode: 'create' })}><HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />新建文件夹</Button></EmptyContent>
          </Empty> : <div className="grid gap-5 @container/drive sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {folders.map((folder) => {
              const workspace = folder.workspace
              const manageable = workspace ? canManageFolder(workspace) : false
              return <ContextMenu key={folder.id}>
                <ContextMenuTrigger asChild>
                  <Card size="sm" className="relative min-h-56 overflow-visible transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-lg focus-within:ring-2 focus-within:ring-ring">
                    <button type="button" className="flex h-full w-full flex-col items-start gap-4 px-5 py-5 text-start outline-none" onClick={() => open(folder)}>
                      <span className="grid size-20 place-items-center rounded-4xl bg-primary/10 text-primary">
                        <HugeiconsIcon icon={Folder01Icon} strokeWidth={1.5} className="size-12" />
                      </span>
                      <span className="min-w-0 space-y-1">
                        <span className="block truncate font-heading text-lg font-medium">{folder.name}</span>
                        <span className="block line-clamp-2 min-h-10 text-sm text-muted-foreground">{folder.description || '暂无描述'}</span>
                      </span>
                      <span className="mt-auto flex w-full flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary">{folderKind(folder)}</Badge>
                        {folder.status === 'ARCHIVED' ? <Badge variant="outline">已归档</Badge> : null}
                        {folder.sourceCount !== undefined ? <span className="ms-auto">{folder.sourceCount} 项资料</span> : null}
                      </span>
                    </button>
                  </Card>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onSelect={() => setEditor({ mode: 'create' })}><HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />新建同级文件夹</ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onSelect={() => open(folder)}><HugeiconsIcon icon={Folder01Icon} strokeWidth={2} />打开文件夹</ContextMenuItem>
                  {manageable && workspace ? <ContextMenuItem onSelect={() => setEditor({ mode: 'rename', workspace })}><HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />重命名</ContextMenuItem> : null}
                  {manageable && workspace && !workspace.isDefault ? <ContextMenuSeparator /> : null}
                  {manageable && workspace && !workspace.isDefault && workspace.status !== 'ARCHIVED' ? <ContextMenuItem variant="destructive" onSelect={() => void archiveFolder(workspace)}><HugeiconsIcon icon={Archive02Icon} strokeWidth={2} />归档文件夹</ContextMenuItem> : null}
                  {manageable && workspace && !workspace.isDefault ? <ContextMenuItem variant="destructive" onSelect={() => void deleteFolder(workspace)}><HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />永久删除</ContextMenuItem> : null}
                </ContextMenuContent>
              </ContextMenu>
            })}
          </div>}
    </div>
    <FolderEditorDialog editor={editor} onOpenChange={(open) => { if (!open) setEditor(null) }} onSaved={async (projectId) => { setEditor(null); await load(); setOpenFolderId(projectId) }} />
  </div></DashboardSectionFrame>
}

function FolderEditorDialog({ editor, onOpenChange, onSaved }: {
  editor: FolderEditor | null
  onOpenChange(open: boolean): void
  onSaved(projectId: string): Promise<void>
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setName(editor?.mode === 'rename' ? editor.workspace.name : '')
    setDescription(editor?.mode === 'rename' ? editor.workspace.description : '')
  }, [editor])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const normalized = name.trim()
    if (!editor || !normalized || busy) return
    setBusy(true)
    try {
      if (editor.mode === 'create') {
        const created = await toastAction(knowledgeApi.createProject({ name: normalized, description: description.trim() }), {
          loading: '正在创建文件夹', success: '文件夹已创建', error: (reason) => userFacingError(reason, '创建文件夹失败'),
        })
        await onSaved(created.id)
      } else {
        await toastAction(knowledgeApi.updateProject(editor.workspace.id, { name: normalized, description: description.trim() }), {
          loading: '正在保存文件夹', success: '文件夹已更新', error: (reason) => userFacingError(reason, '更新文件夹失败'),
        })
        await onSaved(editor.workspace.id)
      }
    } catch { /* Toast owns the visible error state. */ }
    finally { setBusy(false) }
  }

  return <Dialog open={editor !== null} onOpenChange={onOpenChange}>
    <DialogContent>
      <form onSubmit={submit} className="space-y-6">
        <DialogHeader><DialogTitle>{editor?.mode === 'rename' ? '编辑工作区文件夹' : '新建工作区文件夹'}</DialogTitle><DialogDescription>文件夹对应独立工作区，成员和资料权限沿用该工作区设置。</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label htmlFor="drive-folder-name">名称</Label><Input id="drive-folder-name" value={name} maxLength={80} autoFocus onChange={(event) => setName(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="drive-folder-description">描述</Label><Input id="drive-folder-description" value={description} maxLength={1000} onChange={(event) => setDescription(event.target.value)} /></div>
        </div>
        <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>取消</Button><Button type="submit" disabled={busy || !name.trim()}>{busy ? '保存中' : '保存'}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
