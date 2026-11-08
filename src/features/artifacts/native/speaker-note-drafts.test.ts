import assert from 'node:assert/strict'
import test from 'node:test'
import { createDocument, createPage } from '../../../../shared/artifact-document'
import { SpeakerNoteDraftStore } from './speaker-note-drafts'

function noteDocument() {
  const document = createDocument('slides', 'notes', '讲者草稿'),
    page = createPage('page')
  document.pages[page.id] = page
  document.pageOrder = [page.id]
  return document
}

test('权限/冲突拒绝提交不会丢弃备注，恢复后只提交该草稿并保留最初CAS基准', () => {
  const base = noteDocument(),
    pageId = base.pageOrder[0],
    store = new SpeakerNoteDraftStore()
  store.set(pageId, '本地输入', base)
  store.flush(() => false)
  assert.equal(store.size, 1)
  assert.equal(store.get(pageId)?.text, '本地输入')
  const remote = { ...base, seq: base.seq + 1 }
  store.set(pageId, '保留后继续编辑', remote)
  assert.equal(store.get(pageId)?.base, base)
  let submissions = 0
  store.flush((id, text, start) => {
    submissions++
    assert.equal(id, pageId)
    assert.equal(text, '保留后继续编辑')
    assert.equal(start, base)
    return true
  })
  assert.equal(submissions, 1)
  assert.equal(store.size, 0)
})
test('中文组字期间不提交；记录可恢复，明确结束组字后才可保存', () => {
  const base = noteDocument(),
    pageId = base.pageOrder[0],
    store = new SpeakerNoteDraftStore()
  store.set(pageId, '中文输入中', base, true)
  let submissions = 0
  store.flush(() => {
    submissions++
    return true
  })
  assert.equal(submissions, 0)
  assert.equal(store.recovery()[pageId].text, '中文输入中')
  assert.equal(store.recovery()[pageId].composing, true)
  store.set(pageId, '中文已确认', base, false)
  store.flush(() => {
    submissions++
    return true
  })
  assert.equal(submissions, 1)
})
test('未修改备注不产生草稿，清理只在显式恢复动作后发生', () => {
  const base = noteDocument(),
    pageId = base.pageOrder[0],
    store = new SpeakerNoteDraftStore()
  store.set(pageId, base.pages[pageId].notes, base)
  assert.equal(store.size, 0)
  store.set(pageId, '下载前必须保留', base)
  const recovery = store.recovery()
  store.clear()
  assert.equal(store.size, 0)
  assert.equal(recovery[pageId].text, '下载前必须保留')
})

test('关闭窗口后的组字草稿保留，自动卸载不提交；明确重试保存才能提交', () => {
  const base = noteDocument(),
    id = base.pageOrder[0],
    store = new SpeakerNoteDraftStore()
  store.set(id, '未结束的中文输入', base, true)
  store.suspendComposition(id)
  let writes = 0
  store.flush(() => {
    writes++
    return true
  })
  assert.equal(writes, 0)
  assert.equal(store.get(id)?.text, '未结束的中文输入')
  store.flush(
    () => {
      writes++
      return true
    },
    undefined,
    true,
  )
  assert.equal(writes, 1)
  assert.equal(store.size, 0)
})
