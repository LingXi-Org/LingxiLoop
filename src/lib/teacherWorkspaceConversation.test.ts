import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8')

test('teacher workspaces expose the managed research group in the conversation list', async () => {
  const [pane, store, provisioning] = await Promise.all([
    read('../features/conversations/components/ConversationsPane.tsx'),
    read('../features/conversations/store.ts'),
    read('../../server/src/modules/learning/teacher-provisioning-repository.ts'),
  ])

  assert.match(pane, /conversation\.kind !== 'email'/)
  assert.match(pane, /results\.groups/)
  assert.doesNotMatch(pane, /list\.filter\(\(conversation\) => conversation\.kind === 'direct'\)/)
  assert.match(pane, /conversation\.kind === 'group' && conversation\.tag !== 'teacher'/)
  assert.match(store, /title: c\.title/)
  assert.doesNotMatch(store, /教师室/)
  assert.match(store, /const fallback = conversations\[0\]/)
  assert.match(provisioning, /`课题组｜\$\{input\.courseTitle\}`/)
  assert.match(provisioning, /ON CONFLICT\(id\) DO UPDATE SET[\s\S]*title=EXCLUDED\.title/)
})
