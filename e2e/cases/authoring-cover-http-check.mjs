import assert from 'node:assert/strict'

/** Real HTTP + PostgreSQL fixture contract check. Never browser/UI evidence. */
export async function checkAuthoringCoverHttp(baseURL) {
  const checks = []
  const request = async (path, method = 'GET', body) => {
    const response = await fetch(baseURL + path, { method, headers: { 'content-type': 'application/json', 'x-company-id': 'cases-school' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    return { status: response.status, data: await response.json().catch(() => null) }
  }
  const native = (id, text) => ({ format: 'blocknote', version: 1, projection: text, sections: [text],
    blocks: [{ id, type: 'paragraph', props: {}, content: [{ type: 'text', text, styles: {} }], children: [] }] })
  const title = '合成案例验收449-HTTP持久化'
  const input = { title, summary: '合成摘要', body: '合成正文，非真实学生资料。', cover: null, category: '合成验收', tags: ['fixture'],
    summaryDocument: native('summary-449', '合成摘要'), editorDocument: native('body-449', '合成正文，非真实学生资料。') }
  const created = await request('/api/cases', 'POST', input)
  assert.equal(created.status, 201)
  checks.push('real POST creates one synthetic case')
  const id = created.data.id
  const updated = await request(`/api/cases/${id}`, 'PUT', { ...input, title: title + '-已保存', version: created.data.version })
  assert.equal(updated.status, 200)
  assert.equal(updated.data.version, created.data.version + 1)
  checks.push('real PUT returns next acknowledged version')
  const reopened = await request(`/api/cases/${id}?view=manage`)
  assert.equal(reopened.status, 200)
  assert.deepEqual(reopened.data.editorDocument, input.editorDocument)
  assert.deepEqual(reopened.data.summaryDocument, input.summaryDocument)
  const persisted = await request(`/api/fixture-authoring-cover/${id}/persistence`)
  assert.equal(persisted.status, 200)
  assert.equal(persisted.data.version, updated.data.version)
  assert.equal(persisted.data.draft.body, input.body)
  assert.equal(persisted.data.draft.summary, input.summary)
  assert.deepEqual(persisted.data.draft.editorDocument, input.editorDocument)
  assert.deepEqual(persisted.data.draft.summaryDocument, input.summaryDocument)
  checks.push('GET and direct SQL snapshot match acknowledged native summary/body/version')
  const published = await request(`/api/cases/${id}/publish`, 'POST', { version: updated.data.version })
  assert.equal(published.status, 200)
  const reader = await request(`/api/cases/${id}`)
  assert.equal(reader.status, 200)
  assert.equal(reader.data.body, input.body)
  checks.push('publish uses latest version and real reader GET returns published content')
  const states = []
  for (const state of ['legacy', 'pending', 'generating', 'failed', 'cancelled', 'ready', 'asset-failed', 'vm-failed']) {
    const changed = await request(`/api/fixture-authoring-cover/${id}/state/${state}`, 'POST')
    assert.equal(changed.status, 200)
    assert.equal(changed.data.modelCall, false)
    const detail = await request(`/api/cases/${id}?view=manage`)
    assert.equal(detail.status, 200)
    assert.equal(detail.data.version, published.data.version, 'cover state changes must not claim an article save')
    if (state === 'legacy') assert.equal(detail.data.generatedCover, null)
    else assert.equal(detail.data.generatedCover.status, ['asset-failed', 'vm-failed'].includes(state) ? 'ready' : state)
    if (state === 'ready') {
      const preview = await fetch(baseURL + detail.data.generatedCover.previewUrl)
      assert.equal(preview.status, 200)
      assert.match(preview.headers.get('content-type'), /image\/svg\+xml/)
      assert.match(await preview.text(), /M100 160 L300 160/)
      const asset = await request(detail.data.generatedCover.interactiveUrl)
      assert.equal(asset.status, 200)
      assert.equal(JSON.parse(asset.data.html).engine, 'quickjs-wasm')
    }
    if (state === 'asset-failed') assert.equal((await fetch(baseURL + detail.data.generatedCover.previewUrl)).status, 503)
    if (state === 'vm-failed') {
      const asset = await request(detail.data.generatedCover.interactiveUrl)
      assert.equal(asset.status, 200)
      assert.match(JSON.parse(asset.data.html).figure, /synthetic VM failure/)
    }
    states.push({ state, descriptor: detail.data.generatedCover?.status ?? null, version: detail.data.version })
  }
  checks.push('eight fixed fixture states persist and real API assets preserve their HTTP contract')
  const deleted = await request(`/api/cases/${id}`, 'DELETE', { version: published.data.version })
  assert.equal(deleted.status, 200)
  assert.deepEqual(deleted.data, { deleted: true, id })
  const tombstone = await request(`/api/fixture-authoring-cover/${id}/persistence`)
  assert.equal(tombstone.status, 200)
  assert.ok(tombstone.data.deleted_at)
  assert.equal(tombstone.data.draft.body, input.body)
  assert.equal((await request(`/api/cases/${id}?view=manage`)).status, 404)
  assert.equal((await request(`/api/cases/${id}`)).status, 404)
  const managementList = await request(`/api/cases?view=manage&q=${encodeURIComponent(title)}`)
  assert.equal(managementList.status, 200)
  assert.ok(managementList.data.items.every(item => item.id !== id))
  checks.push('real DELETE retains a SQL tombstone while both GET views return 404 and management list omits the case')
  return { checks, states, caseId: id, version: published.data.version, deletedAt: tombstone.data.deleted_at,
    deleteResult: deleted.data, synthetic: true, modelCalls: 0,
    scope: 'HTTP→API→PostgreSQL fixture contract only; UI, worker execution, crop and video unverified' }
}
