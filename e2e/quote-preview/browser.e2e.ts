import { mkdir, writeFile } from 'node:fs/promises'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Failure model (written before implementation): generic Button borders override
// quote chrome; quote detaches from user bubble; owner/attachments disappear on
// history projection; quote is duplicated across text parts; long text overflows;
// cancel submits/steals focus; click/repeated keyboard activation loses jump;
// send loses replyToClientMsgNo; dark/mobile selectors leak into the message body.
for (const width of [1280,390]) test(`quoted reply surfaces ${width}`, async ({app,browser,screen}) => {
  await browser.setViewport({width,height:1000})
  await app.open('/e2e/quote-preview/index.html')
  await expect(browser.locator('[data-msg-id="mine"]')).toBeVisible({timeout:90000})
  await browser.evaluate(() => {document.querySelector('[data-chat-viewport]')!.scrollTop=0;return true})
  const baseline = process.env.E2E_QUOTE_BASELINE === '1'
  const inspect = () => browser.evaluate(() => {
    const message=document.querySelector('[data-msg-id="mine"]')!
    const quote=message.querySelector('[data-quote-preview]') ?? message.querySelector('button.w-full')!
    const style=getComputedStyle(quote), box=quote.getBoundingClientRect()
    return {radius:style.borderRadius,borders:[style.borderTopWidth,style.borderRightWidth,style.borderBottomWidth,style.borderLeftWidth],background:style.backgroundColor,font:style.fontSize,width:box.width,height:box.height,inBubble:!!quote.closest('[data-message-bubble]'),className:quote.className,bodyFont:getComputedStyle(message.querySelector('[data-message-bubble]')!).fontSize}
  })
  const metrics=await inspect()
  await app.screenshot(`${baseline?'before':'after'}-light-${width}`)
  if (!baseline) {
    expect(metrics.inBubble).toBe(true)
    expect(metrics.radius).toBe('10px')
    expect(metrics.borders.slice(0,3)).toEqual(['0px','0px','0px'])
    expect(metrics.bodyFont).toBe('16px')
    await expect(browser.locator('[data-msg-id="mine"] [data-quote-preview]')).toContainText('陈晨')
    await expect(browser.locator('[data-msg-id="file-reply"] [data-quote-preview]')).toContainText('缓存设计.pdf')
    await expect(browser.locator('[data-msg-id="unavailable"] [data-quote-preview]')).toContainText('原消息不可用')
    await expect(browser.locator('[data-msg-id="file-only-reply"] [data-quote-preview]')).toHaveCount(1)
    await expect(browser.locator('[data-msg-id="multi-reply"] [data-quote-preview]')).toHaveCount(1)
    await expect(browser.locator('[data-msg-id="snapshot-reply"] [data-quote-preview]')).toContainText('历史作者')
    await expect(browser.locator('[data-msg-id="incoming-reply"] [data-message-bubble] [data-quote-preview]')).toContainText('林悦')
    const quote=browser.locator('[data-msg-id="mine"] [data-quote-preview]')
    await quote.focus();await browser.keyboard.press('Enter')
    await expect.poll(()=>browser.evaluate(()=>document.querySelector('[data-msg-id="original"]')!.classList.contains('quote-jump-flash'))).toBe(true)
    await quote.focus();await browser.keyboard.press('Space')
    await expect.poll(()=>browser.evaluate(()=>document.querySelector('[data-msg-id="original"]')!.classList.contains('quote-jump-flash'))).toBe(true)
    expect(await browser.evaluate(()=>Array.from(document.querySelectorAll('[data-quote-preview]')).every(el=>el.scrollWidth<=el.clientWidth+1))).toBe(true)
    for (const id of ['empty-reply','tool-reply']) await expect(browser.locator(`[data-msg-id="${id}"] [data-quote-preview]`)).toContainText('原消息不可用')
    await screen.getByRole('button','补全原文',{exact:true}).tap()
    for (const id of ['empty-reply','tool-reply']) await expect(browser.locator(`[data-msg-id="${id}"] [data-quote-preview]`)).toContainText('后续正文已到达')
  }
  await screen.getByRole('button','准备回复',{exact:true}).tap()
  await app.screenshot(`${baseline?'before':'after'}-composer-${width}`)
  if (!baseline) {
    await expect(browser.locator('[data-composer-quote]')).toContainText('陈晨')
    await screen.getByRole('button','取消回复',{exact:true}).tap()
    await expect(browser.locator('[data-composer-quote]')).toHaveCount(0)
    await expect.poll(()=>browser.evaluate(()=>document.activeElement?.getAttribute('contenteditable') ?? null)).toBe('true')
    await screen.getByRole('button','回复净化文本',{exact:true}).tap()
    await expect(browser.locator('[data-composer-quote] .rce-mbox-reply-message')).toHaveText('已净化引用')
    await screen.getByRole('button','取消回复',{exact:true}).tap()
    await screen.getByRole('button','回复隐藏文本',{exact:true}).tap()
    await expect(browser.locator('[data-composer-quote] .rce-mbox-reply-message')).toHaveText('原消息不可用')
    await screen.getByRole('button','取消回复',{exact:true}).tap()
    await screen.getByRole('button','回复附件',{exact:true}).tap()
    await expect(browser.locator('[data-composer-quote]')).toContainText('缓存设计.pdf')
    await screen.getByRole('button','取消回复',{exact:true}).tap()
    await screen.getByRole('button','准备回复',{exact:true}).tap()
    await browser.locator('[contenteditable="true"]').fill('发送回复测试')
    await browser.keyboard.press('Enter')
    await expect.poll(()=>browser.evaluate(()=>document.documentElement.dataset.sentReply ?? null)).toBe('original')
    await expect.poll(()=>browser.evaluate(()=>document.documentElement.dataset.sentPayloadReply ?? null)).toBe('original')
    await expect(browser.locator('[data-composer-quote]')).toHaveCount(0)
  }
  await screen.getByRole('button','切换主题',{exact:true}).tap()
  await browser.evaluate(()=>{document.querySelector('[data-chat-viewport]')!.scrollTop=0;return true})
  await app.screenshot(`${baseline?'before':'after'}-dark-${width}`)
  await mkdir('.e2e/quote-preview',{recursive:true})
  await writeFile(`.e2e/quote-preview/${baseline?'before':'after'}-${width}.json`,JSON.stringify(metrics,null,2))
  if (!baseline) {
    await app.open('/e2e/quote-preview/index.html')
    await expect(browser.locator('[data-msg-id="mine"] [data-quote-preview]')).toContainText('陈晨')
  }
})
