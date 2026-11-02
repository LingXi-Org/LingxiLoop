import { type ComponentProps, lazy, Suspense } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { FilePreviewDialog as EagerFilePreviewDialog } from './file-preview-dialog'

// Messages and cards only offer files; the viewers load when one is opened.
const LoadedFilePreviewDialog = lazy(() => import('./file-preview-dialog').then(module => ({ default: module.FilePreviewDialog })))

export function FilePreviewDialog(props: ComponentProps<typeof EagerFilePreviewDialog>) {
  return <Suspense fallback={<Dialog open onOpenChange={open => { if (!open) props.onClose() }}>
    <DialogContent aria-describedby={undefined}><DialogTitle className="sr-only">文件预览</DialogTitle><p role="status">正在打开文件…</p></DialogContent>
  </Dialog>}>
    <LoadedFilePreviewDialog {...props} />
  </Suspense>
}
