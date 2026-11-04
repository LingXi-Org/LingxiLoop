import assert from 'node:assert/strict'

// Run against the case fixture at 1440×900 using the browser tool's tab binding.
export async function checkCaseOutline(tab) {
  const results = []
  for (const [name, id] of [['课堂流程', 'case-section-0'], ['在线 softmax 的那一步', 'case-section-2'], ['作业与学生自评', 'case-section-3']]) {
    await tab.playwright.getByRole('link', { name, exact: true }).filter({ visible: true }).click()
    const state = await tab.playwright.evaluate(() => ({
      active: document.querySelector('.case-outline [aria-current]')?.textContent,
      focused: document.activeElement?.id,
      scrollTop: document.querySelector('[data-page-scroll]')?.scrollTop,
    }))
    assert.equal(state.active, name)
    assert.equal(state.focused, id)
    results.push(state)
  }
  assert.equal(results[1].scrollTop, results[2].scrollTop, 'both final headings exercise the clamped scroll position')
  await tab.playwright.getByRole('heading', { name: '作业与学生自评', exact: true }).press('PageUp', { timeoutMs: 2000 })
  const manualScroll = await tab.playwright.evaluate(() => ({
    active: document.querySelector('.case-outline [aria-current]')?.textContent,
    scrollTop: document.querySelector('[data-page-scroll]')?.scrollTop,
  }))
  assert.ok(manualScroll.scrollTop < results[2].scrollTop)
  assert.notEqual(manualScroll.active, '作业与学生自评')
  return { clicks: results, manualScroll }
}
