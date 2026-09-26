import { AlertCircleIcon, Presentation01Icon, RefreshCwIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress'
import { toastAction } from '@/lib/actionToast'
import { confirmSensitiveAction } from '@/lib/confirmAction'
import { PRESENTATION_STATUS_LABELS, type PresentationDetailV1 } from '../contracts'
import { usePresentationResource, usePresentations } from '../state'
import { PresentationOutlineReview } from './PresentationOutlineReview'
import { PresentationViewer } from './PresentationViewer'

function generationProgress(presentation: PresentationDetailV1): number {
  if (typeof presentation.progress === 'number') {
    const percentage = presentation.progress <= 1 ? presentation.progress * 100 : presentation.progress
    return Math.round(Math.max(0, Math.min(100, percentage)))
  }
  return {
    waitingForSources: 8,
    planning: 24,
    awaitingOutlineApproval: 40,
    generating: 68,
    validating: 90,
    ready: 100,
    needsAttention: 40,
    failed: 0,
    cancelled: 0,
  }[presentation.status]
}

function PendingPresentation({ presentation }: { presentation: PresentationDetailV1 }) {
  const progress = generationProgress(presentation)
  return (
    <div className="h-full overflow-y-auto px-4 py-5 sm:px-6">
      <div className="mx-auto grid w-full max-w-4xl gap-4">
        <Card size="sm">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>{presentation.title}</CardTitle>
              <Badge variant="outline">{PRESENTATION_STATUS_LABELS[presentation.status]}</Badge>
              {presentation.visibilityScope === 'PRIVATE' && <Badge variant="outline">仅自己可见</Badge>}
            </div>
            <CardDescription>{presentation.requestText}</CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={progress} max={100} aria-label="演示生成进度">
              <ProgressLabel>生成进度</ProgressLabel>
              <ProgressValue />
            </Progress>
          </CardContent>
        </Card>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <ResourceSkeleton variant="media" className="min-h-80" label="正在生成演示文稿" />
        </div>
      </div>
    </div>
  )
}

function UnavailablePresentation({
  presentation,
  retrying,
  onRetry,
}: {
  presentation: PresentationDetailV1
  retrying: boolean
  onRetry: () => void
}) {
  const needsAttention = presentation.status === 'needsAttention'
  const cancelled = presentation.status === 'cancelled'
  const detail = needsAttention && presentation.recommendedPageCount
      ? `这些资料适合制作约 ${presentation.recommendedPageCount} 页。请在群聊中确认缩短页数，或补充资料后重试。`
      : needsAttention
        ? '现有资料不足以完成这份演示文稿。请补充资料或调整页数。'
        : cancelled
          ? '已取消生成这份演示文稿。'
          : '未能完成这份演示文稿，请稍后重试。'

  return (
    <div className="grid h-full place-items-center overflow-y-auto px-6 py-10">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><HugeiconsIcon icon={AlertCircleIcon} strokeWidth={2} /></EmptyMedia>
          <EmptyTitle>{needsAttention ? '需要补充资料' : cancelled ? '已取消生成' : '演示文稿未能完成'}</EmptyTitle>
          <EmptyDescription>{detail}</EmptyDescription>
        </EmptyHeader>
        {!needsAttention && (
          <Button type="button" variant="outline" onClick={onRetry} disabled={retrying}>
            <HugeiconsIcon icon={RefreshCwIcon} strokeWidth={2} data-icon="inline-start" />
            {retrying ? '正在重试…' : '重新生成'}
          </Button>
        )}
      </Empty>
    </div>
  )
}

export function PresentationDrawerContent({ presentationId }: { presentationId: string }) {
  const { presentation, versions, loaded, loading, error, refresh } = usePresentationResource(
    presentationId,
    { refreshOnMount: true },
  )
  const approveOutline = usePresentations((state) => state.approveOutline)
  const retryPresentation = usePresentations((state) => state.retry)
  const [approving, setApproving] = useState(false)
  const [retrying, setRetrying] = useState(false)

  if (loading && !presentation) {
    return <ResourceSkeleton variant="detail" className="h-full" label="正在加载演示文稿" />
  }

  if (error && !presentation) {
    return (
      <div className="grid h-full place-items-center overflow-y-auto px-6 py-10" role="alert">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><HugeiconsIcon icon={Presentation01Icon} strokeWidth={2} /></EmptyMedia>
            <EmptyTitle>暂时无法加载演示文稿</EmptyTitle>
            <EmptyDescription>{error}</EmptyDescription>
          </EmptyHeader>
          <Button type="button" variant="outline" onClick={() => void refresh()}>
            <HugeiconsIcon icon={RefreshCwIcon} strokeWidth={2} data-icon="inline-start" />
            重试
          </Button>
        </Empty>
      </div>
    )
  }

  if (loaded && !presentation) {
    return (
      <div className="grid h-full place-items-center overflow-y-auto px-6 py-10">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><HugeiconsIcon icon={Presentation01Icon} strokeWidth={2} /></EmptyMedia>
            <EmptyTitle>找不到这份演示文稿</EmptyTitle>
            <EmptyDescription>它可能已被删除，或你没有访问权限。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  if (!presentation) {
    return <ResourceSkeleton variant="detail" className="h-full" label="正在加载演示文稿" />
  }

  if (presentation.status === 'awaitingOutlineApproval' && presentation.outline) {
    const approve = async () => {
      if (approving) return
      const confirmed = await confirmSensitiveAction({
        title: '确认大纲并开始生成？',
        description: `将按这份 ${presentation.outline?.targetPageCount ?? presentation.targetPageCount} 页大纲生成完整演示文稿。`,
        confirmLabel: '开始生成',
        tone: 'warning',
      })
      if (!confirmed) return
      setApproving(true)
      try {
        await toastAction(approveOutline(presentation.id, presentation.outlineRevision), {
          loading: '正在开始生成',
          success: '已开始生成演示文稿',
          error: '无法确认大纲，请重试',
          description: presentation.title,
        })
      } catch {
        await refresh()
      } finally {
        setApproving(false)
      }
    }
    return <PresentationOutlineReview presentation={presentation} approving={approving} onApprove={() => void approve()} />
  }

  if (presentation.status === 'ready') {
    return <PresentationViewer presentation={presentation} versions={versions} />
  }

  if (presentation.status === 'failed' || presentation.status === 'needsAttention' || presentation.status === 'cancelled') {
    const retry = async () => {
      if (retrying) return
      setRetrying(true)
      try {
        await toastAction(retryPresentation(presentation.id), {
          loading: '正在重新生成演示文稿',
          success: '已重新开始生成演示文稿',
          error: '无法重新生成，请稍后重试',
          description: presentation.title,
        })
      } catch {
        // The shared Toast owns user-facing retry errors.
      } finally {
        setRetrying(false)
      }
    }
    return <UnavailablePresentation presentation={presentation} retrying={retrying} onRetry={() => void retry()} />
  }

  return <PendingPresentation presentation={presentation} />
}
