import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { mkdir, writeFile } from 'node:fs/promises'
const output = process.env.CONTENT_BOUNDARY_OUTPUT || '.codex-tmp/content-boundary-browser'
for (const [label, criteria] of [
  ['plain', ['Explain the first inference', 'Verify the second result']],
  ['multiline-literal', ['Explain **literal** criterion\nand its second line', 'Verify the result']],
] as const) test(`legacy criteria keep separate native paragraphs on edit and reopen: ${label}`, async ({app,browser,screen}) => {
  await app.open('/e2e/content-boundaries/fixture.html')
  await browser.evaluate(async criteria => { await fetch('/boundary/reset',{method:'POST',body:JSON.stringify({criteria})}); return true }, criteria)
  await app.open('/e2e/content-boundaries/fixture.html')
  const editor = () => screen.getByLabel('验收标准',{exact:true})
  await expect(editor()).toBeVisible({timeout:90000})
  const initial = await browser.evaluate(()=>({paragraphs:document.querySelector('[aria-label="验收标准"]')?.querySelectorAll('[data-content-type="paragraph"]').length ?? 0,text:document.querySelector('[aria-label="验收标准"]')?.textContent ?? null}))
  await editor().focus();await browser.keyboard.press('Control+End');await browser.keyboard.type(' reviewed')
  await screen.getByRole('button','保存修改',{exact:true}).tap()
  await expect.poll(async()=>browser.evaluate(async()=>(await fetch('/boundary/evidence').then(r=>r.json())).patches.length)).toBe(1)
  const first = await browser.evaluate(async()=>await fetch('/boundary/evidence').then(r=>r.json()))
  await mkdir(output,{recursive:true});await writeFile(`${output}/${label}-first.json`,JSON.stringify({initial,...first},null,2))
  expect(first.patches[0].criteria).toHaveLength(2)
  expect(first.patches[0].criteriaDocument.blocks).toHaveLength(2)
  expect(initial.paragraphs).toBe(2)
  if(label==='plain') expect(first.patches[0].criteria[0]).toBe(criteria[0])
  await app.open('/e2e/content-boundaries/fixture.html')
  await expect(editor()).toContainText(criteria[0].split('\n')[0])
  await editor().focus();await browser.keyboard.press('Control+End');await browser.keyboard.press('Control+b');await browser.keyboard.type(' formatted');await browser.keyboard.press('Control+b')
  await screen.getByRole('button','保存修改',{exact:true}).tap()
  await expect.poll(async()=>browser.evaluate(async()=>(await fetch('/boundary/evidence').then(r=>r.json())).patches.length)).toBe(2)
  const second = await browser.evaluate(async()=>await fetch('/boundary/evidence').then(r=>r.json()))
  await writeFile(`${output}/${label}-reopen.json`,JSON.stringify(second,null,2))
  expect(second.patches[1].criteria).toHaveLength(2)
  expect(second.patches[1].criteriaDocument.blocks[0]).toEqual(first.patches[0].criteriaDocument.blocks[0])
  expect(JSON.stringify(second.patches[1].criteriaDocument.blocks)).toContain('formatted')
  await app.screenshot(`criteria-${label}-reopened`)
})
test('private legacy recovery remains available after editing current content',async({app,browser,screen})=>{
  await app.open('/e2e/content-boundaries/fixture.html?answer=1')
  const editor=screen.getByLabel('私有作答',{exact:true});await expect(editor).toContainText('PRIVATE ORIGINAL A',{timeout:90000})
  await editor.fill('CURRENT ANSWER B')
  await expect.poll(async()=>browser.evaluate(()=>JSON.parse(document.querySelector('[data-answer]')!.textContent!).document?.projection)).toContain('CURRENT ANSWER B')
  const answer=await browser.evaluate(()=>JSON.parse(document.querySelector('[data-answer]')!.textContent!))
  await mkdir(output,{recursive:true});await writeFile(`${output}/private-answer.json`,JSON.stringify(answer,null,2))
  expect(answer.document.legacyMarkdown).toBe('PRIVATE ORIGINAL A')
  expect(JSON.stringify(answer.document.blocks)).not.toContain('PRIVATE ORIGINAL A')
})
