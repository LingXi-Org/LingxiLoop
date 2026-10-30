import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { createViewerResource } from '../lib/viewer-resource'
import { FileViewerMedia, releaseMediaElement } from './file-viewer-media'

test('remote audio and video use native media URLs without a CORS fetch', () => {
  for (const [fileName, kind] of [['sound.mp3', 'audio'], ['clip.mp4', 'video']] as const) {
    const resource = createViewerResource({ kind: 'url', url: 'https://media.test/file', fileName })
    const html = renderToStaticMarkup(<FileViewerMedia resource={resource} kind={kind} />)
    assert.match(html, new RegExp(`<${kind}[^>]*controls`))
    assert.match(html, /src="https:\/\/media\.test\/file"/)
    assert.match(html, /下载/)
  }
})

test('media teardown stops playback and releases its source', () => {
  const calls: string[] = []
  releaseMediaElement({ pause: () => calls.push('pause'), removeAttribute: (name: string) => calls.push(`remove:${name}`), load: () => calls.push('load') } as unknown as HTMLMediaElement)
  assert.deepEqual(calls, ['pause', 'remove:src', 'load'])
})
