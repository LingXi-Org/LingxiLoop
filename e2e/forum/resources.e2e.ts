import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// #121/#187: no parallel resource aggregation or case publication in the forum.
// Existing submission/file/provenance journeys remain in browser.e2e.ts and the server suite.
test('forum offers only assignments and discussions on desktop and mobile', async ({ app, screen, browser }) => {
  await app.open('/')
  await browser.evaluate(async () => {localStorage.setItem('lingxiloop-theme','light');return (await fetch('/api/fixture-role/teacher')).ok})
  const title='Q、K、V 的区别：从注意力公式到缓存复用'
  expect(await browser.evaluate(async title=>{
    const headers={'x-company-id':'e2e-school','content-type':'application/json'}
    const path='/api/courses/e2e-course/forum/post/forum-homework'
    const item=await fetch(path,{headers}).then(r=>r.json())
    return (await fetch(path,{method:'PUT',headers,body:JSON.stringify({kind:item.kind,tags:item.tags,links:item.links,attachments:item.attachments,sourceId:item.sourceId,dueAt:item.dueAt,title,body:'通过概念辨析、手算和推理分析，理解 Q、K、V 的分工及 KV 缓存的作用。\n\n## 一、概念辨析\n\n用自己的话解释以下问题，每点不超过 150 字。\n\n1. Q、K、V 分别由什么投影得到，形状上有什么关系？\n2. 为什么缩放点积注意力需要归一化？\n\n## 二、手算小题\n\n设单个注意力头的维度为 2，已知：\n\n```text\nQ = [[1, 0], [0, 1]]\nK = [[1, 0], [0, 1]]\nV = [[1, 0], [0, 2]]\n```\n\n计算注意力得分并说明输出向量。\n\n## 三、推理阶段的行为\n\n解释 prefill 与 decode 阶段 K、V 的处理方式，以及 KV 缓存的复用原理。',editorDocument:null})})).status
  },title)).toBe(200)
  await app.open('/?project=e2e-classroom&view=forum')
  await expect(screen.getByLabel('搜索学习论坛')).toBeVisible({ timeout: 120000 })
  await screen.getByLabel('搜索学习论坛').fill(title)
  await expect(screen.getByRole('link',title,{exact:true})).toBeVisible()
  for (const width of [1774, 1440, 768, 390]) {
    await browser.setViewport({ width, height: 887 })
    if (width === 390) await screen.getByRole('button', '打开学习论坛导航').tap()
    const sections = screen.getByRole('navigation', '学习论坛版块')
    await expect(sections.getByRole('button')).toHaveCount(3)
    for (const label of ['全部内容', '作业', '自由讨论']) {
      await expect(sections.getByRole('button', label, { exact: true })).toBeVisible()
    }
    for (const label of ['资料', '作品案例', '官方案例', '精选']) {
      await expect(sections.getByRole('button', label, { exact: true })).toHaveCount(0)
    }
    await sections.getByRole('button', '作业', { exact: true }).tap()
    await expect(screen.getByRole('link',title,{exact:true})).toBeVisible()
    await expect(browser.locator('[data-forum-layout]')).toHaveAttribute('aria-busy','false')
    await app.screenshot(`forum-scope-navigation-${width}`)
    await expect(screen.getByRole('heading', '课程资料库', { exact: true })).toHaveCount(0)
    expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await browser.setViewport({width:1774,height:887})
  await screen.getByRole('button','筛选',{exact:true}).tap()
  await expect(screen.getByLabel('内容筛选')).toBeVisible()
  await browser.keyboard.press('Escape')
  await screen.getByRole('button','按日期排序',{exact:true}).tap()
  await expect(screen.getByLabel('时间顺序')).toBeVisible()
  await screen.getByLabel('时间顺序').tap()
  await screen.getByRole('option','最早在前',{exact:true}).tap()
  await expect.poll(()=>browser.evaluate(()=>JSON.parse(localStorage.getItem('lingxiloop-forum-display')!).order)).toBe('asc')
  await browser.keyboard.press('Escape')
  await screen.getByRole('link',title,{exact:true}).tap()
  await expect(browser.locator('[data-memo-detail]')).toBeVisible()
  await expect(screen.getByRole('link','查看提交',{exact:true})).toBeVisible()
  expect(await browser.evaluate(()=>{
    const doc=document.querySelector('[data-forum-document]')!.getBoundingClientRect()
    return doc.width<=800 && doc.width>600
  })).toBe(true)
  await app.screenshot('forum-document-1774')
  for (const width of [1440,768,390]) {
    await browser.setViewport({width,height:887})
    expect(await browser.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await app.screenshot(`forum-document-${width}`)
  }
  await browser.setViewport({width:1774,height:887})
  await screen.getByRole('link','查看提交',{exact:true}).tap()
  expect(await browser.evaluate(()=>document.activeElement?.classList.contains('forum-workflow') ?? false)).toBe(true)
  await screen.getByRole('button',`管理：${title}`,{exact:true}).tap()
  await screen.getByRole('menuitem','编辑内容',{exact:true}).tap()
  const edit=screen.getByRole('region','编辑学习论坛内容')
  await expect(edit.getByLabel('内容正文',{exact:true})).toHaveAttribute('contenteditable','true')
  await browser.locator('[data-memo-detail] .bn-inline-content').first().tap()
  await browser.keyboard.press('Control+End')
  await browser.keyboard.press('Enter')
  await browser.keyboard.type('详情管理编辑验收')
  await edit.getByRole('button','保存修改',{exact:true}).tap()
  await expect(browser.locator('[data-memo-detail]')).toContainText('详情管理编辑验收')
  await expect(edit).toHaveCount(0)
  await screen.getByRole('link','返回学习论坛',{exact:true}).tap()
  await expect(screen.getByRole('link',title,{exact:true})).toBeVisible()
  await expect.poll(()=>browser.evaluate(()=>document.activeElement?.textContent ?? null)).toBe(title)
  await screen.getByLabel('搜索学习论坛').fill('')
  await screen.getByRole('link','Memos 学习报告详情',{exact:true}).tap()
  await screen.getByRole('link','查看进度与验收',{exact:true}).tap()
  expect(await browser.evaluate(()=>document.activeElement?.classList.contains('forum-workflow') ?? false)).toBe(true)
  await expect(screen.getByRole('heading','验收标准',{exact:true})).toBeVisible()
  await app.screenshot('native-homework-review-entry')
  await screen.getByRole('link','返回学习论坛',{exact:true}).tap()
  await browser.setViewport({width:390,height:887})
  await browser.reload()
  await expect(screen.getByLabel('搜索学习论坛')).toBeVisible()
  const composer = screen.getByRole('region', '发布学习论坛内容')
  await composer.getByRole('button', '展开发布框').tap()
  await expect(composer.getByRole('group', '发布类型').getByRole('button')).toHaveCount(2)
  await expect(composer.getByRole('button', '自由讨论', { exact: true })).toBeVisible()
  await expect(composer.getByRole('button', '正式作业', { exact: true })).toBeVisible()
  await app.screenshot('forum-scope-composer-mobile')
})
