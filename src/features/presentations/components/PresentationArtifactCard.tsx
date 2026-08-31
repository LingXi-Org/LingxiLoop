import { Presentation01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  PRESENTATION_STATUS_LABELS,
  type PresentationArtifactDescriptor,
  type PresentationStatus,
} from '../contracts'
import { usePresentationResource } from '../state'

function badgeVariant(status: PresentationStatus): 'secondary' | 'outline' | 'destructive' {
  if (status === 'failed' || status === 'needsAttention') return 'destructive'
  if (status === 'ready') return 'secondary'
  return 'outline'
}

export function PresentationArtifactCard({
  artifact,
  onOpen,
  className,
}: {
  artifact: PresentationArtifactDescriptor
  onOpen: (presentationId: string) => void
  className?: string
}) {
  const { presentation, loading, error } = usePresentationResource(artifact.artifactId)

  if (loading && !presentation) {
    return (
      <div className={cn('my-2 w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card', className)}>
        <ResourceSkeleton variant="list" count={1} compact label="正在加载 HTML 演示" />
      </div>
    )
  }

  const title = presentation?.title || artifact.title
  const pageCount = presentation?.latestVersion?.pageCount ?? presentation?.targetPageCount

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={() => onOpen(artifact.artifactId)}
      data-presentation-open-trigger={artifact.artifactId}
      className={cn(
        'my-2 h-auto w-full max-w-xl justify-start whitespace-normal rounded-2xl border border-border bg-card p-4 text-start shadow-xs hover:bg-muted/50',
        className,
      )}
      aria-label={`打开 HTML 演示：${title}`}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <HugeiconsIcon icon={Presentation01Icon} strokeWidth={2} className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-heading text-sm font-medium text-foreground">{title}</span>
          {presentation && <Badge variant={badgeVariant(presentation.status)}>{PRESENTATION_STATUS_LABELS[presentation.status]}</Badge>}
          {presentation?.visibilityScope === 'PRIVATE' && <Badge variant="outline">仅自己可见</Badge>}
        </span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
          {error && !presentation
            ? error
            : presentation
              ? `${pageCount} 页 · ${presentation.status === 'awaitingOutlineApproval' ? '请确认大纲后开始生成' : '自包含离线 HTML'}`
              : '打开查看演示详情'}
        </span>
      </span>
    </Button>
  )
}
