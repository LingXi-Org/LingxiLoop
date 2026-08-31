import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const desktop = readFileSync(new URL('./DesktopApp.tsx', import.meta.url), 'utf8')

test('desktop opens HTML lecture decks in the shared immersive Drawer', () => {
  assert.match(desktop, /surface\?\.kind === 'presentation' \? surface\.presentationId : null/)
  assert.match(desktop, /<PresentationDrawerContent presentationId=\{presentationId\} \/>/)
  assert.match(desktop, /canvasId \|\| presentationId \? ' max-w-none/)
  assert.match(desktop, /else if \(presentationId\) \{ drawerTitle = 'HTML 演示'/)
  assert.match(desktop, /closePresentationPeek\(\)[\s\S]*?data-presentation-open-trigger[\s\S]*?\.focus\(\)/)
})
