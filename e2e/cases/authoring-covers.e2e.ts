import { test, type Browser } from '@e2e-dev/web'
import { expect, type JsonValue } from 'e2e'
import { mkdir, writeFile } from 'node:fs/promises'
import { nativePaste } from '../content-editor/native'
import { connectLiveCoverPage } from '../case-cover/live-cdp'

const title = '合成案例验收449-保存与封面'
const initialBody = '合成正文初稿，不包含真实学习资料。'
const revisedBody = '合成正文修订，保存失败后仍可继续编辑。'
async function request(browser: Browser, path: string, method = 'GET', body: JsonValue = null) {
  return browser.evaluate(async ({ path, method, body }) => {
    const response = await fetch(path, { method, headers: { 'content-type': 'application/json', 'x-company-id': 'cases-school' },
      ...(body === null ? {} : { body: JSON.stringify(body) }) })
    return { status: response.status, data: await response.json().catch(() => null) }
  }, { path, method, body })
}
async function coverCrop(browser: Browser, selector: string, label: string) {
  // The official facade has full screenshots; native CDP supplies a clipped capture only.
  const cdp = await connectLiveCoverPage(await browser.url())
  try {
    const clip = await browser.evaluate(selector => {
      const box = document.querySelector(selector)!.getBoundingClientRect()
      return { x: box.x + scrollX, y: box.y + scrollY, width: box.width, height: box.height, scale: 1 }
    }, selector)
    const png = await cdp.send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: true })
    await mkdir('artifacts/issue-449/browser/crops', { recursive: true })
    await writeFile(`artifacts/issue-449/browser/crops/${label}.png`, Buffer.from(png.data, 'base64'))
  } finally { await cdp.close() }
}

test('one synthetic case retains acknowledged authoring and renders fixed cover states with the first real hover', async ({ app, browser, screen }) => {
  await app.open('/')
  expect((await request(browser, '/api/fixture-role/teacher')).status).toBe(200)
  await app.open('/cases?project=cases-classroom&view=cases&caseView=manage')
  await screen.getByRole('button', '新建案例', { exact: true }).tap()
  await screen.getByLabel('标题', { exact: true }).fill(title)
  await expect(screen.getByRole('button', '发布', { exact: true })).toBeDisabled()
  await expect(screen.getByText('填写正文后可发布', { exact: true })).toBeVisible()
  await nativePaste(browser, screen, '摘要', '合成摘要，需要保持原生文档。')
  await nativePaste(browser, screen, '正文', initialBody)
  await screen.getByRole('button', '保存草稿', { exact: true }).tap()
  await expect(screen.getByRole('status').first()).toContainText('草稿已保存')
  await expect(screen.getByLabel('正文', { exact: true })).toContainText(initialBody)
  const list = (await request(browser, `/api/cases?view=manage&q=${encodeURIComponent(title)}`)).data
  expect(list.items.length).toBe(1)
  const article = list.items[0]
  const persisted = (await request(browser, `/api/fixture-authoring-cover/${article.id}/persistence`)).data
  expect(persisted.version).toBe(article.version)
  expect(persisted.draft.editorDocument).toEqual(article.editorDocument)
  expect(persisted.draft.summaryDocument).toEqual(article.summaryDocument)
  expect(persisted.draft.body).toContain(initialBody)
  await nativePaste(browser, screen, '正文', revisedBody)
  expect((await request(browser, '/api/fixture-authoring-cover/fail-next/save', 'POST')).status).toBe(200)
  await screen.getByRole('button', '保存草稿', { exact: true }).tap()
  await expect(screen.getByRole('alert')).toContainText('草稿未保存')
  await expect(screen.getByLabel('正文', { exact: true })).toContainText(revisedBody)
  expect((await request(browser, `/api/fixture-authoring-cover/${article.id}/persistence`)).data.version).toBe(article.version)
  await screen.getByRole('button', '保存草稿', { exact: true }).tap()
  await expect.poll(async () => (await request(browser, `/api/fixture-authoring-cover/${article.id}/persistence`)).data.draft.body).toContain(revisedBody)
  await screen.getByRole('button', '预览', { exact: true }).tap()
  await screen.getByRole('button', '保存草稿', { exact: true }).tap()
  await expect(screen.getByRole('region', '案例预览')).toContainText(revisedBody)
  expect((await request(browser, '/api/fixture-authoring-cover/fail-next/publish', 'POST')).status).toBe(200)
  await screen.getByRole('button', '发布', { exact: true }).tap()
  await expect(screen.getByRole('alert')).toContainText('草稿已保存，发布未完成')
  await expect(screen.getByRole('region', '案例预览')).toContainText(revisedBody)
  await app.screenshot('449-saved-draft-publish-failure-keeps-preview')
  await screen.getByRole('button', '发布', { exact: true }).tap()
  await expect(screen.getByRole('status').first()).toContainText('案例已发布')
  await browser.reload()
  await expect(screen.getByText(revisedBody, { exact: true })).toBeVisible()
  expect((await request(browser, `/api/cases/${article.id}`)).data.body).toContain(revisedBody)

  for (const state of ['legacy', 'pending', 'generating', 'failed', 'cancelled', 'ready']) {
    expect((await request(browser, `/api/fixture-authoring-cover/${article.id}/state/${state}`, 'POST')).status).toBe(200)
    await browser.mouse.move(0, 0)
    await browser.reload()
    const cover = browser.locator('[data-case-hero] [data-case-cover]')
    if (state !== 'legacy') await expect(cover).toHaveAttribute('data-cover-status', state)
    if (state === 'pending' || state === 'generating') await expect(cover).toContainText(state === 'pending' ? '等待生成' : '生成中')
    if (state === 'pending') await expect(screen.getByRole('button', '刷新封面状态', { exact: true })).toBeVisible()
    if (state === 'failed') await expect(screen.getByRole('button', '重试封面', { exact: true })).toBeVisible()
    await app.screenshot(`449-cover-${state}`)
  }
  await screen.getByRole('button', '返回案例库', { exact: true }).tap()
  const homeCover = `[data-case-grid] article:has(a[href*="/cases/${article.id}?"]) [data-case-cover]`
  await expect(browser.locator(homeCover)).toHaveCount(1)
  await expect(browser.locator(homeCover)).toHaveAttribute('data-cover-status', 'ready')
  await expect.poll(() => browser.evaluate(selector => {
    const image = document.querySelector(`${selector} img`) as HTMLImageElement | null
    return Boolean(image?.complete && image.naturalWidth)
  }, homeCover)).toBe(true)
  expect(await browser.evaluate(selector => document.querySelectorAll(`${selector} img[src^="blob:"]`).length, homeCover)).toBe(0)
  await app.screenshot('449-homepage-before-first-hover')
  await coverCrop(browser, homeCover, '449-homepage-before-first-hover')
  const box = await browser.evaluate(selector => {
    const rect = document.querySelector(`${selector} > div`)!.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  }, homeCover)
  expect(await browser.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)).toBe(true)
  // Enter the homepage card once, then keep the pointer still while the VM starts.
  await browser.mouse.move(box.x + box.width * .25, box.y + box.height * .5)
  await expect.poll(() => browser.evaluate(async selector => {
    const image = document.querySelector(`${selector} img[src^="blob:"]`) as HTMLImageElement | null
    return image?.complete && image.naturalWidth ? fetch(image.src).then(response => response.text()) : ''
  }, homeCover)).toContain('M100 160 L300 100')
  await app.screenshot('449-homepage-after-first-hover')
  await coverCrop(browser, homeCover, '449-homepage-after-first-hover')
  for (const state of ['asset-failed', 'vm-failed']) {
    expect((await request(browser, `/api/fixture-authoring-cover/${article.id}/state/${state}`, 'POST')).status).toBe(200)
    await browser.mouse.move(0, 0)
    await app.open(`/cases/${article.id}?project=cases-classroom&view=cases&caseView=manage`)
    if (state === 'vm-failed') {
      await expect(browser.locator('[data-case-hero] [data-case-cover]')).toBeVisible()
      const detailBox = await browser.evaluate(() => {
        const rect = document.querySelector('[data-case-hero] [data-case-cover] > div')!.getBoundingClientRect()
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      })
      await browser.mouse.move(detailBox.x + detailBox.width * .25, detailBox.y + detailBox.height * .5)
    }
    await expect(screen.getByRole('button', '重新加载封面', { exact: true })).toBeVisible()
    await app.screenshot(`449-cover-${state}`)
  }
})
