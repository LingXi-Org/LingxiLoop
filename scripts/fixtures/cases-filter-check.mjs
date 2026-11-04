import assert from 'node:assert/strict'

// Open /cases?benchmark in the fixture before calling through the browser tool.
export async function checkCaseFilters(tab) {
  await tab.playwright.locator('html[data-case-ready-ms]').waitFor({ state: 'attached' })
  const initialRequests = await tab.playwright.locator('html').getAttribute('data-case-requests')
  assert.equal(await tab.playwright.locator('[data-case-grid] > article').count(), 6)
  await tab.playwright.getByRole('button', { name: '推理优化', exact: true }).click()
  await tab.getAXState({ emit: false })
  assert.equal(await tab.playwright.locator('[data-case-grid] > article').count(), 2)
  assert.equal(await tab.playwright.locator('.case-featured').count(), 1)
  assert.equal(await tab.playwright.locator('html').getAttribute('data-case-requests'), initialRequests)
  const sample = await tab.playwright.evaluate(() => JSON.parse(document.documentElement.dataset.caseSamples).at(-1))
  assert.equal(sample.retainedHero, true)
  assert.equal(sample.requests, 0)
  const chrome = await tab.playwright.evaluate(() => ({
    selected: getComputedStyle(document.querySelector('.case-categories [aria-pressed=true]')).backgroundColor,
    divider: getComputedStyle(document.querySelector('.server-rail-scroll'), '::before').content,
  }))
  assert.equal(chrome.selected, 'rgb(46, 125, 91)')
  assert.equal(chrome.divider, 'none')
  await tab.playwright.getByRole('button', { name: '全部', exact: true }).click()
  await tab.playwright.getByRole('searchbox', { name: '搜索案例' }).fill('KV')
  await tab.getAXState({ emit: false })
  assert.equal(await tab.playwright.locator('[data-case-grid] > article').count(), 1)
  assert.equal(await tab.playwright.locator('.case-featured').count(), 1)
  await tab.playwright.getByRole('searchbox', { name: '搜索案例' }).fill('no-matching-case')
  await tab.getAXState({ emit: false })
  assert.equal(await tab.playwright.locator('[data-case-grid] > article').count(), 0)
  assert.equal(await tab.playwright.getByText('下方列表没有匹配的案例', { exact: true }).count(), 1)
  await tab.playwright.getByRole('button', { name: '清除筛选', exact: true }).click()
  await tab.getAXState({ emit: false })
  assert.equal(await tab.playwright.locator('[data-case-grid] > article').count(), 6)
  assert.equal(await tab.playwright.locator('html').getAttribute('data-case-requests'), initialRequests)
  await tab.playwright.locator('.case-featured .case-card-copy p').click()
  await tab.playwright.locator('.case-reader').waitFor({ state: 'visible' })
  assert.equal(await tab.playwright.locator('.case-reader-heading h1').textContent(), '用一张画板讲透 FlashAttention：一节 45 分钟课的设计')
  return { sample, chrome, summaryOpensDetail: true }
}

export async function measureCaseFilters(before, after) {
  for (const tab of [before, after]) {
    await tab.reload()
    await tab.playwright.locator('html[data-case-ready-ms]').waitFor({ state: 'attached' })
  }
  for (let i = 0; i < 10; i++) {
    const name = i % 2 === 0 ? '推理优化' : '全部'
    for (const tab of [before, after]) {
      await tab.playwright.getByRole('button', { name, exact: true }).click()
      await tab.getAXState({ emit: false })
    }
  }
  const result = {}
  for (const [name, tab] of [['before', before], ['after', after]]) {
    result[name] = await tab.playwright.evaluate(() => JSON.parse(document.documentElement.dataset.caseSamples))
    assert.equal(result[name].length, 10)
    result[name].forEach(sample => { assert.equal(sample.cards, sample.label === '全部' ? 6 : 2) })
  }
  result.after.forEach(sample => {
    assert.equal(sample.requests, 0)
    assert.equal(sample.retainedHero, true)
  })
  const p75 = values => values.map(value => value.ms).sort((a, b) => a - b)[7]
  assert.ok(p75(result.after) < p75(result.before) / 2, 'filter p75 must halve')
  return result
}
