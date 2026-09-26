import { ArtifactCard } from '@/components/assistant-ui/elements/artifact-card'
import { PresentationIcon } from 'lucide-react'
import {
  PRESENTATION_STATUS_LABELS,
  type PresentationArtifactDescriptor,
} from '../contracts'
import { usePresentationResource } from '../state'
import { usePresentationHtml } from '../html'

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
  const html = usePresentationHtml(presentation?.id ?? null, presentation?.latestVersion?.id ?? null)

  const title = presentation?.title || artifact.title
  const pageCount = presentation?.latestVersion?.pageCount ?? presentation?.targetPageCount
  const meta = loading && !presentation
    ? '正在加载演示文稿'
    : error && !presentation
      ? error
      : presentation
        ? [pageCount ? `${pageCount} 页` : '', PRESENTATION_STATUS_LABELS[presentation.status], presentation.visibilityScope === 'PRIVATE' ? '仅自己可见' : '']
            .filter(Boolean).join(' · ')
        : '打开演示文稿'

  return (
    <ArtifactCard
      onOpen={() => onOpen(artifact.artifactId)}
      openLabel="打开演示文稿"
      icon={<PresentationIcon />}
      preview={html.status === 'ready'
        ? <div className="pointer-events-none absolute inset-0" inert><iframe
          src={html.url} title={`${title}封面预览`} sandbox="allow-scripts" referrerPolicy="no-referrer" tabIndex={-1} loading="lazy"
          className="h-[400%] w-[400%] origin-top-left scale-25 border-0 bg-muted"
        /></div>
        : <div className="flex h-full flex-col justify-center gap-2 p-5 text-foreground">
          <PresentationIcon aria-hidden className="size-5 text-muted-foreground" />
          <p className="line-clamp-2 text-lg font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{html.status === 'error' ? '暂时无法预览封面，可打开演示文稿继续查看' : html.status === 'loading' || loading ? '正在加载封面' : '暂无可预览版本'}</p>
        </div>}
      data-presentation-open-trigger={artifact.artifactId}
      className={className}
      aria-label={`打开演示文稿：${title}`}
      title={title}
      meta={meta}
    />
  )
}
