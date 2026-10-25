import assert from 'node:assert/strict'
import { mock, test, type Mock } from 'node:test'
import type { CaseArticle, CaseInput, casesApi } from './api'
import { submitCase } from './submission'

type SubmissionApi = Pick<typeof casesApi, 'save' | 'action'>
type MockSubmissionApi = { [Key in keyof SubmissionApi]: Mock<SubmissionApi[Key]> }
const input: CaseInput = { title: 'A title-only draft', summary: '', body: '', cover: null, category: '', tags: [] }
const article = (changes: Partial<CaseArticle> = {}): CaseArticle => ({
  ...input, id: 'case-1', companyId: 'company-1', authorId: 'author-1', authorName: 'Author',
  authorAvatarUrl: null, createdAt: '2026-10-25T00:00:00Z', updatedAt: '2026-10-25T00:00:00Z',
  view: 'manage', status: 'draft', version: 1, publishedVersion: null, hasUnpublishedChanges: false,
  canManage: true, indexStatus: null, indexError: null, publishedAt: null, ...changes,
})

// Regression cases written before the helper: saving must retain accepted server identity/version,
// publication failure must be distinct from save failure, and obsolete scope completions stay fenced.
test('saves a title-only empty-body draft without publishing', async () => {
  const saved = article()
  const api: MockSubmissionApi = { save: mock.fn<SubmissionApi['save']>(async () => saved), action: mock.fn<SubmissionApi['action']>(async () => saved) }
  const onSaved = mock.fn<(value: CaseArticle) => void>()
  assert.deepEqual(await submitCase(input, undefined, false, api, () => true, onSaved), { status: 'saved', article: saved })
  assert.deepEqual(api.save.mock.calls[0].arguments, [input, undefined])
  assert.equal(onSaved.mock.calls[0].arguments[0], saved)
  assert.equal(api.action.mock.callCount(), 0)
})

test('passes native documents and their text projections together without changing input', async () => {
  const editorDocument: NonNullable<CaseInput['editorDocument']> = {
    format: 'blocknote', version: 1, projection: '**Body**', sections: ['Body'], legacyMarkdown: '**Body**',
    blocks: [{ id: 'body', type: 'paragraph', props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' }, content: [{ type: 'text', text: 'Body', styles: { bold: true } }], children: [] }],
  }
  const summaryDocument: NonNullable<CaseInput['summaryDocument']> = { ...editorDocument, projection: '**Summary**' }
  const edited: CaseInput = { ...input, body: editorDocument.projection, editorDocument, summary: summaryDocument.projection, summaryDocument }
  const before = structuredClone(edited)
  const saved = article(edited)
  const save = mock.fn<SubmissionApi['save']>(async received => {
    assert.equal(received, edited)
    assert.equal(received.editorDocument, editorDocument)
    assert.equal(received.summaryDocument, summaryDocument)
    assert.equal(received.body, editorDocument.projection)
    assert.equal(received.summary, summaryDocument.projection)
    return saved
  })
  const api: MockSubmissionApi = { save, action: mock.fn<SubmissionApi['action']>(async () => saved) }
  await submitCase(edited, undefined, false, api, () => true, () => {})
  assert.deepEqual(edited, before)
})

for (const existing of [false, true]) {
  test(`${existing ? 'existing draft' : 'new direct publish'} publishes the version returned by save`, async () => {
    const prior = existing ? article({ version: 4 }) : undefined
    const saved = article({ version: existing ? 5 : 1 })
    const published = article({ ...saved, status: 'published', publishedVersion: saved.version })
    const events: string[] = []
    const api: MockSubmissionApi = {
      save: mock.fn<SubmissionApi['save']>(async () => { events.push('save'); return saved }),
      action: mock.fn<SubmissionApi['action']>(async (received, action) => {
        assert.equal(received, saved)
        assert.equal(action, 'publish')
        events.push('publish')
        return published
      }),
    }
    const result = await submitCase(input, prior, true, api, () => true, received => {
      assert.equal(received, saved)
      events.push('adopt')
    })
    assert.deepEqual(api.save.mock.calls[0].arguments, [input, prior])
    assert.deepEqual(events, ['save', 'adopt', 'publish'])
    assert.deepEqual(result, { status: 'published', article: published })
  })
}

test('save failure retains input and neither adopts nor publishes', async () => {
  const error = new Error('Save rejected')
  const before = structuredClone(input)
  const api: MockSubmissionApi = { save: mock.fn<SubmissionApi['save']>(async () => { throw error }), action: mock.fn<SubmissionApi['action']>(async () => article()) }
  const onSaved = mock.fn<(value: CaseArticle) => void>()
  assert.deepEqual(await submitCase(input, undefined, true, api, () => true, onSaved), { status: 'save-failed', error })
  assert.equal(onSaved.mock.callCount(), 0)
  assert.equal(api.action.mock.callCount(), 0)
  assert.deepEqual(input, before)
})

test('publish failure retains the save receipt so retry saves against the latest version', async () => {
  const error = new Error('Publish rejected')
  const saved = article({ version: 5 })
  const retried = article({ version: 6 })
  const published = article({ ...retried, status: 'published', publishedVersion: 6 })
  let adopted = article({ version: 4 })
  const api: MockSubmissionApi = {
    save: mock.fn<SubmissionApi['save']>(async () => saved),
    action: mock.fn<SubmissionApi['action']>(async () => { throw error }),
  }
  const before = structuredClone(input)
  const result = await submitCase(input, adopted, true, api, () => true, value => { adopted = value })
  assert.deepEqual(result, { status: 'publish-failed', article: saved, error })
  assert.equal(adopted, saved)
  assert.deepEqual(input, before)
  const retryApi: MockSubmissionApi = { save: mock.fn<SubmissionApi['save']>(async () => retried), action: mock.fn<SubmissionApi['action']>(async () => published) }
  assert.deepEqual(await submitCase(input, adopted, true, retryApi, () => true, value => { adopted = value }), { status: 'published', article: published })
  assert.equal(retryApi.save.mock.calls[0].arguments[1], saved)
  assert.equal(retryApi.action.mock.calls[0].arguments[0], retried)
})

for (const saveFails of [false, true]) {
  test(`obsolete ${saveFails ? 'failed' : 'successful'} save completion neither adopts nor publishes`, async () => {
    let current = true
    let finish!: (value: CaseArticle) => void
    let fail!: (error: Error) => void
    const api: MockSubmissionApi = {
      save: mock.fn<SubmissionApi['save']>(() => new Promise<CaseArticle>((resolve, reject) => { finish = resolve; fail = reject })),
      action: mock.fn<SubmissionApi['action']>(async () => article()),
    }
    const onSaved = mock.fn<(value: CaseArticle) => void>()
    const pending = submitCase(input, undefined, true, api, () => current, onSaved)
    current = false
    if (saveFails) fail(new Error('Obsolete save failed'))
    else finish(article())
    assert.deepEqual(await pending, { status: 'obsolete' })
    assert.equal(onSaved.mock.callCount(), 0)
    assert.equal(api.action.mock.callCount(), 0)
  })
}

for (const publishFails of [false, true]) {
  test(`obsolete ${publishFails ? 'failed' : 'successful'} publish completion returns no active outcome`, async () => {
    let current = true
    let finish!: (value: CaseArticle) => void
    let fail!: (error: Error) => void
    const saved = article()
    const api: MockSubmissionApi = {
      save: mock.fn<SubmissionApi['save']>(async () => saved),
      action: mock.fn<SubmissionApi['action']>(() => new Promise<CaseArticle>((resolve, reject) => { finish = resolve; fail = reject })),
    }
    const onSaved = mock.fn<(value: CaseArticle) => void>()
    const pending = submitCase(input, undefined, true, api, () => current, onSaved)
    await Promise.resolve()
    assert.equal(onSaved.mock.calls[0].arguments[0], saved)
    current = false
    if (publishFails) fail(new Error('Obsolete publish failed'))
    else finish(article({ status: 'published', publishedVersion: 1 }))
    assert.deepEqual(await pending, { status: 'obsolete' })
    assert.equal(onSaved.mock.callCount(), 1)
  })
}
