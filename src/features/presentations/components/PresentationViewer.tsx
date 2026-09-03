import { Download04Icon, Maximize01Icon, Presentation01Icon, RefreshCwIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { notifyAction, toastAction } from '@/lib/actionToast'
import type { PresentationDetailV1, PresentationVersionSummaryV1 } from '../contracts'
import { downloadPresentationVersion, usePresentationHtml } from '../html'

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '大小未知'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatVersion(version: PresentationVersionSummaryV1): string {
  return `版本 ${version.versionNumber} · ${version.pageCount} 页`
}

export function PresentationViewer({
  presentation,
  versions,
}: {
  presentation: PresentationDetailV1
  versions: PresentationVersionSummaryV1[]
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const sortedVersions = useMemo(
    () => [...versions].sort((left, right) => right.versionNumber - left.versionNumber),
    [versions],
  )
  const preferredVersionId = presentation.latestVersion?.id ?? sortedVersions[0]?.id ?? null
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(preferredVersionId)
  const [reloadRevision, setReloadRevision] = useState(0)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!selectedVersionId || !sortedVersions.some((version) => version.id === selectedVersionId)) {
      setSelectedVersionId(preferredVersionId)
    }
  }, [preferredVersionId, selectedVersionId, sortedVersions])

  const selectedVersion = sortedVersions.find((version) => version.id === selectedVersionId) ?? null
  const html = usePresentationHtml(presentation.id, selectedVersion?.id ?? null, reloadRevision)

  if (sortedVersions.length === 0) {
    return (
      <div className="grid h-full place-items-center px-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><HugeiconsIcon icon={Presentation01Icon} strokeWidth={2} /></EmptyMedia>
            <EmptyTitle>还没有可播放的版本</EmptyTitle>
            <EmptyDescription>页面完成检查后，演示会自动出现在这里。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  const enterFullscreen = async () => {
    const frame = iframeRef.current
    if (!frame?.requestFullscreen) {
      notifyAction({ title: '当前环境不支持全屏播放', type: 'warning' })
      return
    }
    try {
      await frame.requestFullscreen()
    } catch {
      notifyAction({ title: '无法进入全屏播放', description: '请检查浏览器的全屏权限。', type: 'error' })
    }
  }

  const download = async () => {
    if (!selectedVersion || downloading) return
    setDownloading(true)
    try {
      await toastAction(
        downloadPresentationVersion(
          presentation.id,
          selectedVersion.id,
          `${presentation.title}-v${selectedVersion.versionNumber}`,
        ),
        {
          loading: '正在准备 HTML 演示',
          success: 'HTML 演示已开始下载',
          error: 'HTML 演示下载失败',
        },
      )
    } catch {
      // The shared Toast owns user-facing download errors.
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--im-divider-weak)] px-4 py-3">
        <div className="me-auto min-w-40 flex-1">
          <h2 className="truncate font-heading text-sm font-medium text-foreground">{presentation.title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {selectedVersion ? `${selectedVersion.pageCount} 页 · ${formatBytes(selectedVersion.sizeBytes)}` : '自包含离线 HTML'}
          </p>
        </div>
        <Select value={selectedVersionId ?? undefined} onValueChange={setSelectedVersionId}>
          <SelectTrigger size="sm" aria-label="选择演示版本"><SelectValue /></SelectTrigger>
          <SelectContent align="start">
            {sortedVersions.map((version) => (
              <SelectItem key={version.id} value={version.id}>{formatVersion(version)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" size="sm" onClick={download} disabled={downloading || !selectedVersion}>
          <HugeiconsIcon icon={Download04Icon} strokeWidth={2} data-icon="inline-start" />
          {downloading ? '正在下载…' : '下载 HTML'}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => void enterFullscreen()} disabled={html.status !== 'ready'}>
          <HugeiconsIcon icon={Maximize01Icon} strokeWidth={2} data-icon="inline-start" />
          全屏播放
        </Button>
      </div>

      <div className="min-h-0 flex-1 bg-muted/50 p-3 sm:p-5">
        <div className="relative h-full min-h-64 overflow-hidden rounded-2xl bg-muted shadow-sm ring-1 ring-border">
          {html.status === 'loading' && <ResourceSkeleton variant="media" className="h-full" label="正在加载 HTML 演示" />}
          {html.status === 'error' && (
            <div className="grid h-full place-items-center bg-card px-6">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon"><HugeiconsIcon icon={Presentation01Icon} strokeWidth={2} /></EmptyMedia>
                  <EmptyTitle>演示加载失败</EmptyTitle>
                  <EmptyDescription>{html.error}</EmptyDescription>
                </EmptyHeader>
                <Button type="button" variant="outline" onClick={() => setReloadRevision((value) => value + 1)}>
                  <HugeiconsIcon icon={RefreshCwIcon} strokeWidth={2} data-icon="inline-start" />
                  重试
                </Button>
              </Empty>
            </div>
          )}
          {html.status === 'empty' && (
            <div className="grid h-full place-items-center bg-card px-6">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon"><HugeiconsIcon icon={Presentation01Icon} strokeWidth={2} /></EmptyMedia>
                  <EmptyTitle>请选择演示版本</EmptyTitle>
                </EmptyHeader>
              </Empty>
            </div>
          )}
          {html.status === 'ready' && (
            <iframe
              ref={iframeRef}
              src={html.url}
              title={`${presentation.title}演示`}
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
              allow="fullscreen"
              allowFullScreen
              className="h-full w-full border-0 bg-muted"
            />
          )}
        </div>
      </div>
    </div>
  )
}
