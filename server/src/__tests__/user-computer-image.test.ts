import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('user computer image keeps one persistent browser service and lightweight screens', async () => {
  const dockerfile = await readFile(new URL('../../../server/docker/user-computer.Dockerfile', import.meta.url), 'utf8')
  const entrypoint = await readFile(new URL('../../../server/docker/user-computer-entrypoint.sh', import.meta.url), 'utf8')

  assert.match(dockerfile, /\bchromium\b/)
  assert.match(dockerfile, /\bchromium-sandbox\b/)
  assert.match(dockerfile, /\bxvfb\b/)
  assert.match(dockerfile, /\bopenbox\b/)
  assert.match(dockerfile, /\bnovnc\b/)
  assert.match(dockerfile, /\bxdotool\b/)
  assert.doesNotMatch(dockerfile, /\b(?:gnome|kde)\b/i)
  assert.match(entrypoint, /--user-data-dir=\/home\/lingxi\/\.config\/chromium/)
  assert.match(entrypoint, /--no-sandbox/)
  assert.match(entrypoint, /\/tmp\/\.X11-unix/)
  assert.match(entrypoint, /127\.0\.0\.1:9222\/json\/version/)
  assert.equal((entrypoint.match(/^runuser .* chromium \\/gm) ?? []).length, 1)
})

test('native Docker runtime mounts every persistent user directory separately', async () => {
  const source = await readFile(new URL('../agents/computer/user-computer.ts', import.meta.url), 'utf8')

  for (const path of ['/home/lingxi', '/workspace', '/documents', '/downloads']) {
    assert.match(source, new RegExp(`-v.*:${path.replaceAll('/', '\\/')}`))
  }
  assert.match(source, /export interface SandboxRuntime/)
  assert.match(source, /const displayNumber = 11 \+/)
})
