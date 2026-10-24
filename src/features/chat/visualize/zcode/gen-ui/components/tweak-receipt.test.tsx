import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { TweakPanel } from './TweakPanel'
import { EMPTY_GEN_UI_SNAPSHOT, type GenUiPage } from '../contract'

test('remounted tweak controls retain accepted and pending operation ownership', () => {
  const page = {} as GenUiPage
  for (const status of ['sending', 'accepted'] as const) {
    const snapshot = { ...EMPTY_GEN_UI_SNAPSHOT, tweakValues: { addresses: 48 },
      tweakSubmission: { fingerprint: '[["addresses",48]]', status } }
    for (let mount = 0; mount < 2; mount++) {
      const html = renderToStaticMarkup(<TweakPanel page={page} snapshot={snapshot} />)
      const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)!
      assert.match(buttons.at(-1)!, /disabled=""/, `${status} submit must stay disabled after panel remount`)
      if (status === 'accepted') assert.match(html, /role="status"/)
    }
  }
})
