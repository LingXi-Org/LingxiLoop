import { useEffect, useState } from 'react'
import { userFacingError } from '@/lib/userFacingError'
import { presentationsApi } from './api'

type PresentationHtmlState =
  | { status: 'empty'; url: null; error: null }
  | { status: 'loading'; url: null; error: null }
  | { status: 'error'; url: null; error: string }
  | { status: 'ready'; url: string; error: null }

export function usePresentationHtml(
  presentationId: string | null,
  versionId: string | null,
  reloadRevision = 0,
): PresentationHtmlState {
  const [state, setState] = useState<PresentationHtmlState>({ status: 'empty', url: null, error: null })

  useEffect(() => {
    if (!presentationId || !versionId) {
      setState({ status: 'empty', url: null, error: null })
      return
    }
    const controller = new AbortController()
    let objectUrl: string | null = null
    let active = true
    setState({ status: 'loading', url: null, error: null })
    void presentationsApi.getVersionContent(presentationId, versionId, controller.signal)
      .then((blob) => {
        if (!active) return
        objectUrl = URL.createObjectURL(blob)
        setState({ status: 'ready', url: objectUrl, error: null })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({
          status: 'error',
          url: null,
          error: userFacingError(error, '暂时无法加载演示文件，请稍后重试。'),
        })
      })
    return () => {
      active = false
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [presentationId, reloadRevision, versionId])

  return state
}

export function safePresentationFilename(title: string): string {
  const base = title.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '').slice(0, 120)
  return `${base || 'HTML 演示'}.html`
}

export async function downloadPresentationVersion(
  presentationId: string,
  versionId: string,
  title: string,
): Promise<void> {
  const blob = await presentationsApi.getVersionDownload(presentationId, versionId)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = safePresentationFilename(title)
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
