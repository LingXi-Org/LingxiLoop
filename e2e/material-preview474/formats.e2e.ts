import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

for (const format of ['pdf', 'docx', 'pptx', 'xlsx', 'md', 'png', 'csv', 'json', 'txt']) {
  test(`synthetic ${format} original Blob renders`, async ({ app, browser, screen }) => {
    await app.open(`/e2e/material-preview474/index.html?format=${format}`)
    await expect(browser.locator('[data-file-viewer-mode="preview"]')).toBeVisible()
    const rendered = format === 'pdf' ? 'canvas[data-pdf-render-status="rendered"]'
      : format === 'docx' ? '.docx-wrapper section.docx'
      : format === 'pptx' ? '[data-slot="pptx-slide"] canvas'
      : format === 'png' ? 'canvas[data-image-frame-rendered="true"]'
      : undefined
    if (rendered) await expect(browser.locator(rendered).first()).toBeVisible()
    else await expect.poll(() => browser.evaluate(() => {
      const text = (node: Element | ShadowRoot): string => Array.from(node.children).map(child =>
        `${child.shadowRoot ? text(child.shadowRoot) : ''}${text(child)}${child.children.length ? '' : child.textContent ?? ''}`,
      ).join(' ')
      const root = document.querySelector('[data-file-viewer-mode="preview"]')
      return root ? text(root) : ''
    })).toContain('Triangle')
    if (format === 'pptx') {
      await expect(browser.locator('[data-slot="pptx-slide"] [data-slot="skeleton"]')).toHaveCount(0)
      await expect(browser.locator('[data-slot="pptx-slide"]')).not.toContainText("Couldn't render slide")
      expect(await browser.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>('[data-slot="pptx-slide"] canvas')
        return !!canvas && canvas.width > 300 && canvas.height > 200
      })).toBe(true)
      // Assert slide content, rather than accepting a successfully rendered blank canvas.
      await expect.poll(() => browser.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>('[data-slot="pptx-slide"] canvas')
        const context = canvas?.getContext('2d')
        if (!canvas || !context) return 0
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
        let bluePixels = 0
        for (let index = 0; index < data.length; index += 4) {
          if (data[index] < 80 && data[index + 1] > 60 && data[index + 1] < 150 && data[index + 2] > 180 && data[index + 3] > 200) bluePixels++
        }
        return bluePixels
      })).toBeGreaterThan(1000)
    }
    if (format === 'xlsx' || format === 'csv') await expect(screen.getByRole(format === 'xlsx' ? 'gridcell' : 'cell', 'Triangle', { exact: true })).toBeVisible()
    await app.screenshot(`${format}-original-rendered`)
  })
}
test('ZIP truthful fallback and parsed text remain separate', async ({ app, screen, browser }) => {
  await app.open('/e2e/material-preview474/index.html?format=zip')
  await expect(screen.getByText('此格式暂不支持预览，可下载原文件查看。')).toBeVisible()
  await expect(screen.getByRole('button', '下载原文件', { exact: true })).toBeVisible()
  await expect(screen.getByText('SYNTHETIC_PARSED_TEXT_ONLY')).toHaveCount(0)
  await expect(browser.locator('[data-file-viewer-mode="preview"]')).toHaveCount(0)
  await app.screenshot('zip-truthful-fallback')
  await screen.getByRole('tab', '解析文本', { exact: true }).tap()
  await expect(screen.getByText('SYNTHETIC_PARSED_TEXT_ONLY')).toBeVisible()
  await expect(screen.getByText('此格式暂不支持预览，可下载原文件查看。')).toBeHidden()
  await app.screenshot('parsed-text-separate')
})
