import assert from 'node:assert/strict'

// Run through the browser tool against the disposable case fixture.
export async function checkCaseEditor(tab, viewport, base = 'http://127.0.0.1:5210') {
  const category = `分类验收${Date.now()}`, college = `学院验收${Date.now()}`
  await viewport.set({ width: 1440, height: 900 })
  await tab.goto(`${base}/cases?manager&noCourse`)
  await tab.playwright.getByRole('button', { name: '添加分类', exact: true }).click()
  await tab.playwright.getByRole('textbox', { name: '分类名称', exact: true }).fill(category)
  await tab.playwright.getByRole('button', { name: '添加', exact: true }).click()
  await tab.playwright.getByRole('button', { name: category, exact: true }).waitFor({ state: 'visible' })
  await tab.playwright.getByRole('button', { name: '新增案例', exact: true }).click()
  await tab.playwright.getByRole('textbox', { name: '案例标题', exact: true }).fill('KV 缓存课堂验证')
  await tab.playwright.getByRole('textbox', { name: '正文', exact: true }).fill('先估算显存，再验证缓存随序列长度增长。')
  await tab.playwright.getByRole('combobox', { name: '分类', exact: true }).click()
  await tab.playwright.getByRole('option', { name: category, exact: true }).click()
  await tab.playwright.getByRole('button', { name: '学院', exact: true }).click()
  await tab.playwright.getByRole('combobox', { name: '搜索或创建学院', exact: true }).fill(college)
  await tab.playwright.getByRole('option', { name: `创建“${college}”`, exact: true }).click()
  await tab.playwright.getByRole('textbox', { name: '封面文字', exact: true }).fill('KV')
  await tab.playwright.getByRole('button', { name: '绿色封面', exact: true }).click()
  await tab.playwright.getByRole('button', { name: '保存草稿', exact: true }).click()
  await tab.playwright.getByRole('button', { name: '草稿已保存', exact: true }).waitFor({ state: 'visible' })
  await tab.playwright.getByRole('button', { name: '预览', exact: true }).click()
  await tab.playwright.getByRole('button', { name: '去填写', exact: true }).click()
  assert.equal(await tab.playwright.evaluate(() => document.activeElement?.id), 'case-summary-input')
  await tab.playwright.getByRole('textbox', { name: '一句话简介', exact: true }).fill('课堂验收简介')
  await tab.playwright.getByRole('button', { name: '预览', exact: true }).click()
  assert.equal(await tab.playwright.getByText('一句话简介已填写', { exact: true }).count(), 1)
  await viewport.set({ width: 390, height: 844 })
  await tab.getAXState({ emit: false })
  await tab.screenshot({ fullPage: false })
  const phone = await tab.playwright.evaluate(() => ({
    width: innerWidth,
    frame: document.querySelector('.case-compose-frame').getBoundingClientRect().width,
    content: document.querySelector('.case-compose-layout').getBoundingClientRect().width,
  }))
  assert.equal(phone.width, 390)
  assert.ok(phone.content <= phone.frame)
  await tab.playwright.getByRole('button', { name: '发布', exact: true }).click()
  await tab.playwright.getByText('案例已发布。', { exact: true }).waitFor({ state: 'visible' })
  await viewport.set({ width: 1440, height: 900 })
  await tab.goto(`${base}/cases/sample-0?manager&noCourse&caseView=manage&publishError`)
  await tab.playwright.getByRole('button', { name: '编辑案例', exact: true }).click()
  await tab.playwright.getByRole('button', { name: '学院', exact: true }).click()
  assert.equal(await tab.playwright.getByRole('option', { name: college, exact: true }).isVisible(), true)
  await tab.playwright.getByRole('combobox', { name: '搜索或创建学院', exact: true }).press('Escape')
  await tab.playwright.getByRole('textbox', { name: '一句话简介', exact: true }).fill('发布失败仍保留')
  await tab.playwright.getByRole('button', { name: '发布', exact: true }).click()
  assert.match(await tab.playwright.getByRole('alert').innerText(), /草稿已保存，发布未完成/)
  assert.equal(await tab.playwright.evaluate(() => document.querySelector('#case-summary-input').value), '发布失败仍保留')
  await tab.goto(`${base}/cases?noCourse`)
  await tab.playwright.getByRole('button', { name: '全部', exact: true }).waitFor({ state: 'visible' })
  assert.equal(await tab.playwright.getByRole('button', { name: '新增案例', exact: true }).count(), 0)
  assert.equal(await tab.playwright.getByRole('button', { name: '添加分类', exact: true }).count(), 0)
  await viewport.reset()
  return { category, college, phone, saved: true, published: true, retainedOnFailure: true, studentControlsHidden: true }
}
