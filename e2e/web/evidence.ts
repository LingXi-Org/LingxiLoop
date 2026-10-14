import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Browser } from '@e2e-dev/web'
import type { Screen } from 'e2e'

// Official e2e keeps pixel capture disabled after a secret fill, including restored sessions.
// Save labelled controls and layout facts without serializing private chat or input values.
export async function semanticEvidence(screen: Screen, browser: Browser, label: string, directory = '.e2e/web/semantic') {
  const evidence = {
    label,
    pixels: { captured: false, reason: 'Official e2e pixel capture is unavailable after secret fill; see the separate visual suite for pixel evidence.' },
    headings: await screen.getByRole('heading').allTextContents(),
    buttons: await Promise.all(['发布内容', '发布作业', '确认发布', '保存修改', '保存草稿', '开始学习', '继续学习',
      '更新报告', '预览并提交', '提交作业', '关闭作业', '确认关闭', '退回', '通过'].map(async name => {
      const buttons = screen.getByRole('button', name, { exact: true }), count = await buttons.count()
      return { name, count, enabled: count > 0 ? await buttons.first().isEnabled() : null }
    })),
    page: await browser.evaluate(() => ({
      path: `${location.pathname}${location.search}`, viewport: { width: innerWidth, height: innerHeight },
      documentWidth: document.documentElement.scrollWidth, dark: document.documentElement.classList.contains('dark'),
      focused: { tag: document.activeElement?.tagName ?? null, role: document.activeElement?.getAttribute('role') ?? null,
        label: document.activeElement?.getAttribute('aria-label') ?? null },
      fieldLabels: Array.from(document.querySelectorAll('label')).map(label => label.textContent?.trim() ?? '').filter(Boolean),
    })),
  }
  await mkdir(directory, { recursive: true })
  await writeFile(resolve(directory, `${label}.json`), JSON.stringify(evidence, null, 2))
}
