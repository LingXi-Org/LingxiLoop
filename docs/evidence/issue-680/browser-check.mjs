// Run Vite on5681 and Chromium CDP on9680. Uses synthetic API, real product UI.
import assert from 'node:assert/strict'
import { writeFile, mkdir } from 'node:fs/promises'
import WebSocket from 'ws'
const page = (await (await fetch('http://127.0.0.1:9680/json/list')).json())[0]
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise(resolve => ws.once('open', resolve))
let id = 0; const pending = new Map(), errors = []
ws.on('message', bytes => { const r = JSON.parse(String(bytes)); if (r.id) { const p = pending.get(r.id); pending.delete(r.id); r.error ? p.reject(r.error) : p.resolve(r.result) } else if (r.method === 'Runtime.exceptionThrown') errors.push(r.params.exceptionDetails.text) })
const send = (method, params = {}) => new Promise((resolve, reject) => { const key = ++id; pending.set(key, { resolve, reject }); ws.send(JSON.stringify({ id: key, method, params })) })
const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value }
const until = async expression => { const start = Date.now(); while (!await evaluate(expression)) { if (Date.now() - start > 25000) throw Error(`Timed out: ${expression}`); await new Promise(resolve => setTimeout(resolve, 100)) } }
const click = async selector => { const pos = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`); await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...pos, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...pos, button: 'left', clickCount: 1 }) }
const navigate = async mode => { await send('Page.navigate', { url: `http://127.0.0.1:5681/docs/evidence/issue-680/browser.html?mode=${mode}` }); await until(`!!document.querySelector('[aria-label="管理群成员"]')`); await click('[aria-label="管理群成员"]'); await until(`!!document.querySelector('[aria-label="当前成员"]')`) }
await send('Runtime.enable'); await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
await navigate('manager')
assert.match(await evaluate('document.body.innerText'), /新成员可查看本群已有消息/)
await click('[aria-label="添加溯源"]'); await until(`window.fixture().members.includes('reviewer') && !document.querySelector('[aria-label="添加溯源"]')`)
await click('[aria-label="添加张老师"]'); await until(`window.fixture().members.includes('teacher') && !!document.querySelector('[aria-label="移除张老师"]')`)
await until(`!!document.querySelector('[aria-label="移除溯源"]') && !document.querySelector('[aria-label="移除溯源"]').disabled`)
await evaluate(`document.querySelector('[aria-label="移除溯源"]').focus()`)
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
await until(`!window.fixture().members.includes('reviewer') && !!document.querySelector('[aria-label="添加溯源"]')`)
const manager = await evaluate('window.fixture()')
assert.deepEqual(manager.operations, ['POST:reviewer', 'POST:teacher', 'DELETE:reviewer'])
assert.deepEqual(manager.members, ['student', 'peer', 'teacher'])
assert.equal(await evaluate(`!!document.querySelector('[aria-label="移除学生小林"]')`), false)
await mkdir('artifacts/issue-680', { recursive: true })
const shot = await send('Page.captureScreenshot', { format: 'png' }); await writeFile('artifacts/issue-680/member-management.png', Buffer.from(shot.data, 'base64'))
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
const overflow = await evaluate(`(()=>{const r=document.querySelector('[role="dialog"]').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight}})()`)
assert.ok(overflow.left >= 0 && overflow.right <= overflow.width && overflow.top >= 0 && overflow.bottom <= overflow.height)
await navigate('denied'); assert.match(await evaluate('document.body.innerText'), /请联系群内课程教师或建群者/)
assert.equal(await evaluate(`document.querySelectorAll('[aria-label^="添加溯源"],[aria-label^="移除"]').length`), 0)
await navigate('managed'); assert.match(await evaluate('document.body.innerText'), /此会话的成员由原任务或课程管理/)
assert.ok(await evaluate(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='新建普通群聊')`))
await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='新建普通群聊').focus()`)
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
await until(`Array.from(document.querySelectorAll('[data-slot="dialog-title"]')).some(e=>e.textContent==='新建对话')`)
assert.match(await evaluate('document.body.innerText'), /选择一位参与者开始私聊/)
assert.deepEqual(errors, [])
await writeFile('docs/evidence/issue-680/browser-result.json', JSON.stringify({ passed: true, environment: 'Chromium headless, Vite, synthetic API, real product components/stores/http', manager, mobileBounds: overflow, checks: ['header-member-entry','explicit-shared-history-copy','add-review-agent','add-course-teacher','keyboard-remove-agent','no-self-removal','390px-dialog-bounds','nonmanager-restriction','managed-context-restriction','keyboard-new-conversation-alternative'], runtimeExceptions: errors, exclusions: ['real backend/IM authorization','live-model execution','original T16 production session'] }, null, 2)+'\n')
console.log(JSON.stringify({ passed: true, manager, mobileBounds: overflow, runtimeExceptions: errors }))
ws.close()
