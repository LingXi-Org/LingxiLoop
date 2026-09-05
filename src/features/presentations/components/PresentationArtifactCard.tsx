import { ArtifactCard } from '@/components/assistant-ui/elements/artifact-card'
import {
  PRESENTATION_STATUS_LABELS,
  type PresentationArtifactDescriptor,
} from '../contracts'
import { usePresentationResource } from '../state'

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

  const title = presentation?.title || artifact.title
  const pageCount = presentation?.latestVersion?.pageCount ?? presentation?.targetPageCount
  const meta = loading && !presentation
    ? '正在加载网页演示'
    : error && !presentation
      ? error
      : presentation
        ? [pageCount ? `${pageCount} 页` : '', PRESENTATION_STATUS_LABELS[presentation.status], presentation.visibilityScope === 'PRIVATE' ? '仅自己可见' : '']
            .filter(Boolean).join(' · ')
        : '打开查看演示详情'

  return (
    <ArtifactCard
      role="button"
      tabIndex={0}
      onClick={() => onOpen(artifact.artifactId)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onOpen(artifact.artifactId)
      }}
      data-presentation-open-trigger={artifact.artifactId}
      className={className}
      aria-label={`打开网页演示：${title}`}
      title={title}
      meta={meta}
    />
  )
}
