import { mkdir, writeFile } from 'node:fs/promises'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

const baseline = process.env.USER_IMAGES_BASELINE === '1'
const phase = baseline ? 'before' : 'after'
const messageIds = ['mine-single', 'other-many', 'mine-pure', 'mine-failed', 'mine-pdf', 'assistant-media']
const userImageIds = messageIds.slice(0, 4)

async function evidence(name: string, value: unknown) {
  await mkdir('.e2e/user-images', { recursive: true })
  await writeFile(`.e2e/user-images/${phase}-${name}.json`, JSON.stringify(value, null, 2))
  console.log('USER_IMAGES_EVIDENCE', JSON.stringify({ phase, name, evidence: value }))
}

test('user image thumbnails retain identity and alignment above text at desktop and narrow widths', async ({ app, browser, screen }) => {
  for (const width of [1280, 390]) {
    await browser.setViewport({ width, height: 1000 })
    await app.open('/e2e/user-images/index.html')
    await expect(browser.locator('[data-msg-id="mine-single"]')).toBeVisible()
    await expect(browser.locator('[data-msg-id]')).toHaveCount(6)
    for (const id of messageIds) {
      await browser.evaluate(`() => { document.querySelector('[data-msg-id="${id}"]').scrollIntoView({block:'center'}); return true }`)
      if (id !== 'mine-failed') await expect.poll(() => browser.evaluate(`() => {
        const images = [...document.querySelectorAll('[data-msg-id="${id}"] img')].filter(image => image.src.startsWith('data:image/'));
        return images.every(image => image.complete && image.naturalWidth > 0);
      }`)).toBe(true)
      else await expect(browser.locator('[data-msg-id="mine-failed"]')).toContainText('图片预览不可用')
      await app.screenshot(`${phase}-${id}-${width}`)
    }
    const inspect = () => browser.evaluate(() => {
      const manifest = JSON.parse(document.querySelector('[data-fixture-manifest]')!.textContent!) as Array<{ messageId: string; role: string; attachmentIds: string[]; images: { src: string; name: string }[] }>
      return { manifest, width: innerWidth, documentWidth: document.documentElement.scrollWidth,
        blockedNetwork: (window as unknown as { __userImageNetwork: string[] }).__userImageNetwork,
        rows: [...document.querySelectorAll<HTMLElement>('[data-msg-id]')].map(row => {
          const gallery = row.querySelector<HTMLElement>('[data-message-region="user-images"]')
          const body = row.querySelector<HTMLElement>('[data-message-region="body"]')!
          const card = row.querySelector<HTMLElement>('[data-slot="attachment-card"]')
          const thumbs = [...row.querySelectorAll<HTMLButtonElement>('[data-slot="attachment-thumbnail"]')]
          const box = gallery?.getBoundingClientRect()
          return { id: row.dataset.msgId!, attachmentIds: [...row.querySelectorAll<HTMLElement>('[data-native-attachment]')].map(node => node.dataset.nativeAttachment!),
            gallery: gallery ? { justify: getComputedStyle(gallery).justifyContent, left: box!.left, right: box!.right, top: box!.top, bottom: box!.bottom,
              beforeBody: !!(gallery.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING) } : null,
            bodyText: body.textContent, bodyTop: body.getBoundingClientRect().top, bodyBottom: body.getBoundingClientRect().bottom,
            card: card ? { top: card.getBoundingClientRect().top, width: card.getBoundingClientRect().width, height: card.getBoundingClientRect().height } : null,
            thumbs: thumbs.map(thumb => { const rect = thumb.getBoundingClientRect(); const image = thumb.querySelector('img'); const imageRect = image?.getBoundingClientRect(); return {
              tag: thumb.tagName, name: thumb.title, label: thumb.getAttribute('aria-label'), width: rect.width, height: rect.height,
              left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
              src: image?.getAttribute('src') ?? null, loaded: Boolean(image?.complete && image.naturalWidth > 0),
              imageWidth: imageRect?.width ?? 0, imageHeight: imageRect?.height ?? 0,
              naturalWidth: image?.naturalWidth ?? 0, naturalHeight: image?.naturalHeight ?? 0, objectFit: image ? getComputedStyle(image).objectFit : null,
            } }),
            overflow: row.scrollWidth - row.clientWidth,
          }
        }) }
    })
    const metrics = await inspect()
    await evidence(`layout-${width}`, metrics)
    expect(metrics.rows.map(row => row.id)).toEqual(messageIds)
    expect(metrics.blockedNetwork).toEqual([])
    for (const row of metrics.rows) expect(row.attachmentIds).toEqual(metrics.manifest.find(message => message.messageId === row.id)!.attachmentIds)
    if (baseline) {
      const mine = metrics.rows[0]
      expect(mine.gallery).toBe(null)
      expect(mine.thumbs.length).toBe(0)
      expect(mine.card!.width).toBeGreaterThan(128)
      expect(mine.card!.height).toBeGreaterThan(128)
      expect(mine.card!.top).toBeGreaterThanOrEqual(mine.bodyBottom)
      continue
    }
    expect(metrics.documentWidth).toBeLessThanOrEqual(width)
    for (const id of userImageIds) {
      const row = metrics.rows.find(item => item.id === id)!
      const expected = metrics.manifest.find(item => item.messageId === id)!
      expect(row.gallery).not.toBe(null)
      expect(row.gallery!.beforeBody).toBe(true)
      expect(row.gallery!.justify).toBe(id.startsWith('mine-') ? 'flex-end' : 'flex-start')
      expect(row.thumbs.length).toBe(expected.images.length)
      expect(row.thumbs.map(thumb => thumb.name)).toEqual(expected.images.map(image => image.name))
      expect(row.card).toBe(null)
      expect(row.overflow).toBeLessThanOrEqual(1)
      if (row.bodyText?.trim()) expect(row.gallery!.bottom).toBeLessThanOrEqual(row.bodyTop)
      for (let index = 0; index < row.thumbs.length; index++) {
        const thumb = row.thumbs[index]
        expect(thumb.tag).toBe('BUTTON')
        expect(thumb.width).toBe(128)
        expect(thumb.height).toBe(128)
        expect(thumb.label).toBe(`查看图片：${expected.images[index].name}`)
        expect(thumb.left).toBeGreaterThanOrEqual(row.gallery!.left)
        expect(thumb.right).toBeLessThanOrEqual(row.gallery!.right)
        expect(thumb.imageWidth).toBeLessThanOrEqual(128)
        expect(thumb.imageHeight).toBeLessThanOrEqual(128)
        if (id !== 'mine-failed') {
          expect(thumb.src).toBe(expected.images[index].src)
          expect(thumb.loaded).toBe(true)
          expect(thumb.objectFit).toBe('contain')
          expect(Math.abs(thumb.imageWidth / thumb.imageHeight - thumb.naturalWidth / thumb.naturalHeight)).toBeLessThan(0.01)
        }
      }
      const first = row.thumbs[0]
      if (id.startsWith('mine-') && row.thumbs.length === 1) expect(Math.abs(row.gallery!.right - first.right)).toBeLessThan(1)
      if (id === 'other-many') expect(Math.abs(first.left - row.gallery!.left)).toBeLessThan(1)
    }
    const multi = metrics.rows.find(row => row.id === 'other-many')!
    if (width === 390) expect(multi.thumbs.at(-1)!.top).toBeGreaterThan(multi.thumbs[0].top)
    for (const id of ['mine-pdf', 'assistant-media']) {
      const row = metrics.rows.find(item => item.id === id)!
      expect(row.gallery).toBe(null)
      expect(row.thumbs.length).toBe(0)
      expect(row.card).not.toBe(null)
    }
    await expect(browser.locator('[data-msg-id="mine-single"] [aria-label="已送达"]')).toHaveCount(1)
    await expect(browser.locator('[data-msg-id="mine-pure"] [aria-label="发送中"]')).toHaveCount(1)
    await expect(browser.locator('[data-msg-id="mine-failed"] [data-quote-preview]')).toContainText('公开同学')
    await expect(browser.locator('[data-msg-id="mine-failed"] [role="group"][aria-label="未确认消息操作"]')).toContainText('发送状态待确认')
    await expect(screen.getByRole('button', '核对并重试发送', { exact: true })).toBeVisible()
    await expect(screen.getByRole('button', '移除待发消息', { exact: true })).toBeVisible()
    const identity = () => browser.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-msg-id]')].map(row => ({ id: row.dataset.msgId!,
      attachments: [...row.querySelectorAll<HTMLElement>('[data-native-attachment]')].map(node => node.dataset.nativeAttachment!),
      thumbs: [...row.querySelectorAll<HTMLElement>('[data-slot="attachment-thumbnail"]')].map(node => ({ name: node.title, label: node.getAttribute('aria-label') })),
    })))
    const original = await identity()
    await screen.getByRole('button', '重新挂载消息', { exact: true }).tap()
    await expect(browser.locator('[data-msg-id]')).toHaveCount(6)
    expect(await identity()).toEqual(original)
    await browser.reload()
    await expect(browser.locator('[data-msg-id]')).toHaveCount(6)
    expect(await identity()).toEqual(original)
    await evidence(`identity-${width}`, { original, remountAndReloadMatch: true })
  }
})

test('thumbnails open the existing image viewer by pointer and Enter with zoom and focus return', async ({ app, browser }) => {
  for (const width of [1280, 390]) {
    await browser.setViewport({ width, height: 1000 })
    await app.open('/e2e/user-images/index.html')
    await expect(browser.locator('[data-msg-id="mine-single"]')).toBeVisible()
    if (baseline) {
      await expect(browser.locator('[data-msg-id="mine-single"] [data-slot="attachment-card"] a[aria-label^="查看图片"]')).toBeVisible()
      continue
    }
    const cases = [
      { id: 'mine-single', index: 0, activation: 'pointer' },
      { id: 'other-many', index: 1, activation: 'keyboard' },
    ]
    const observations = []
    for (const { id, index, activation } of cases) {
      const opener = browser.locator(`[data-msg-id="${id}"] [data-slot="attachment-thumbnail"]`).nth(index)
      const expected = await browser.evaluate(`() => { const manifest = JSON.parse(document.querySelector('[data-fixture-manifest]').textContent); return manifest.find(item => item.messageId === '${id}').images[${index}] }`) as { src: string; name: string }
      await opener.focus()
      if (activation === 'pointer') await opener.tap()
      else await browser.keyboard.press('Enter')
      const dialog = browser.locator('[role="dialog"]')
      await expect(dialog).toBeVisible()
      await expect(dialog).toContainText(`预览 ${expected.name}`)
      await expect(browser.locator('[role="dialog"] img')).toHaveAttribute('src', expected.src)
      await expect(browser.locator('[role="dialog"] img')).toHaveAttribute('alt', expected.name)
      await expect(dialog).toContainText('100%')
      await browser.evaluate(async () => {
        await Promise.all(document.querySelector('[role="dialog"]')!.getAnimations().map(animation => animation.finished))
        return true
      })
      const geometry = await browser.evaluate(() => {
        const box = document.querySelector('[role="dialog"]')!.getBoundingClientRect()
        return { left: box.left, top: box.top, width: box.width, height: box.height,
          viewportWidth: innerWidth, viewportHeight: innerHeight, documentWidth: document.documentElement.scrollWidth }
      })
      expect(geometry.left).toBe(0)
      expect(geometry.top).toBe(0)
      expect(geometry.width).toBe(width)
      expect(geometry.height).toBe(1000)
      expect(geometry.documentWidth).toBeLessThanOrEqual(width)
      await browser.keyboard.press('+')
      await expect(dialog).toContainText('125%')
      await app.screenshot(`${phase}-viewer-${activation}-${width}`)
      await browser.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
      await expect.poll(() => browser.evaluate(`() => { const node = document.querySelectorAll('[data-msg-id="${id}"] [data-slot="attachment-thumbnail"]')[${index}]; return document.activeElement === node }`)).toBe(true)
      observations.push({ id, index, activation, src: expected.src, geometry, zoom: '125%', focusReturned: true })
    }
    expect(await browser.evaluate(() => (window as unknown as { __userImageNetwork: string[] }).__userImageNetwork)).toEqual([])
    await evidence(`viewer-${width}`, observations)
  }
})
