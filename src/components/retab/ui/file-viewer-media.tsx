import { useCallback, useEffect, useRef, useState } from 'react'
import type { ViewerResource } from '@/components/retab/lib/viewer-resource'
import { ViewerDownloadButton } from './viewer-download'

export function releaseMediaElement(media: HTMLMediaElement) {
  media.pause(); media.removeAttribute('src'); media.load()
}

export function FileViewerMedia({ resource, kind }: { resource: ViewerResource; kind: 'audio' | 'video' }) {
  const payload = resource.content.payload
  const [url, setUrl] = useState(payload.kind === 'url' ? payload.url : ''), [error, setError] = useState(false)
  const media = useRef<HTMLMediaElement | null>(null)
  const bindMedia = useCallback((node: HTMLMediaElement | null) => {
    if (!node && media.current) releaseMediaElement(media.current)
    media.current = node
  }, [])
  useEffect(() => {
    setError(false)
    const objectUrl = payload.kind === 'blob' ? URL.createObjectURL(payload.blob) : ''
    setUrl(payload.kind === 'url' ? payload.url : objectUrl)
    return () => {
      if (media.current) releaseMediaElement(media.current)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [payload])
  return <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 p-6">
    {error ? <p role="alert">此媒体无法播放，请下载后使用其他应用打开。</p> : !url ? <p role="status">正在加载媒体…</p> : kind === 'audio'
      ? <audio ref={bindMedia} controls src={url} aria-label={resource.fileName} onError={() => setError(true)} className="max-w-full" />
      : <video ref={bindMedia} controls src={url} aria-label={resource.fileName} onError={() => setError(true)} className="max-h-full max-w-full" />}
    <ViewerDownloadButton action={{ ...resource.originalDownload, label: '下载' }} variant="outline" size="sm" className="" showLabel />
  </div>
}
