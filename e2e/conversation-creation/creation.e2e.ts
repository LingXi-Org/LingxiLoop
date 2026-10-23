import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

const names=['司南','寻知','成器','明理','溯源','砺思']
test('six agents retain selection and request identity after a lost creation response',async({app,screen,browser})=>{
  await app.open('/e2e/conversation-creation.html')
  await screen.getByRole('button','新建对话').tap()
  const dialog=screen.getByRole('dialog','新建对话')
  for(const name of names) await dialog.getByText(name,{exact:true}).tap()
  await dialog.getByRole('button','创建群聊').tap()
  await expect(dialog.getByRole('alert')).toBeVisible()
  await expect(dialog.getByText('已选择 6 / 49 人',{exact:true})).toBeVisible()
  await app.screenshot('issue327-lost-response-selection-retained')
  await dialog.getByRole('button','创建群聊').tap()
  await expect(dialog).toBeHidden()
  await expect(browser.locator('#opened')).toHaveText('created-group')
  await expect(browser.locator('#committed')).toHaveText('1')
  const requests=JSON.parse(await browser.locator('#requests').textContent() ?? '[]')
  expect(requests).toHaveLength(2)
  expect(requests[0].requestId).toBeTruthy()
  expect(requests[1]).toEqual(requests[0])
  expect(requests[0].participantIds).toHaveLength(6)
  await app.screenshot('issue327-retry-opened-once')
})
test('business validation is clear and keeps all six selected agents',async({app,screen})=>{
  await app.open('/e2e/conversation-creation.html?mode=validation')
  await screen.getByRole('button','新建对话').tap()
  const dialog=screen.getByRole('dialog','新建对话')
  for(const name of names) await dialog.getByText(name,{exact:true}).tap()
  await dialog.getByRole('button','创建群聊').tap()
  await expect(dialog.getByRole('alert')).toHaveText('所选参与者已不可用或不属于当前项目，请重新选择。')
  await expect(dialog.getByText('已选择 6 / 49 人',{exact:true})).toBeVisible()
  await app.screenshot('issue327-validation-selection-retained')
})
