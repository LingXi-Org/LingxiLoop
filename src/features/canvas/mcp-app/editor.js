// Fixed first-party App. Its only inputs are document data and SDK notifications.
// The official SDK is imported by document.ts; no window.zcode bridge is installed.
import { App, PostMessageTransport, McpUiResourceTeardownResultSchema as RecordResultSchema } from '@modelcontextprotocol/ext-apps/app-with-deps'
const app = new App({ name: 'lingxiloop-canvas-document', version: '1.0.0' }, {}, { autoResize: false })
const textarea = document.querySelector('textarea')
const status = document.querySelector('output')
const save = document.getElementById('save')
const reference = document.getElementById('reference')
const reload = document.getElementById('reload')
let latest = null
let base = null
let busy = false
let documentPending = false
let editGeneration = 0
let retainedAfterRead = false
let connected = false
let closed = false
let changedState = Promise.resolve()
const dirty = () => Boolean(base && (textarea.value !== base.content || retainedAfterRead))
const report = (text, error = false) => { status.textContent = text; status.className = error ? 'error' : '' }
function controls() {
  const capabilities = app.getHostCapabilities()
  textarea.disabled = !connected || !base
  textarea.readOnly = closed
  save.disabled = !connected || !capabilities?.serverTools || !dirty() || busy || closed
  reference.disabled = !connected || !capabilities?.updateModelContext?.structuredContent || !base || dirty() || busy || closed
  reload.disabled = busy || closed
}
function viewChanged() {
  controls()
  if (!connected || closed) return
  // ZCode's widget-state extension is view-only here: just the unsaved indicator.
  const state = { dirty: dirty() }
  changedState = changedState.catch(() => {}).then(() => app.request(
    { method: 'ui/set-widget-state', params: { widgetState: state } }, RecordResultSchema,
  )).catch(() => report('编辑器连接已失效，请保留草稿并重试。', true))
}
function receive(doc, replaceDraft = false) {
  if (!doc || !Number.isSafeInteger(doc.revision) || doc.revision < 1 || typeof doc.content !== 'string') return
  if (latest && (doc.id !== latest.id || doc.canvasId !== latest.canvasId || doc.revision < latest.revision)) return
  latest = doc
  // A pending save/read may replace the persisted baseline. Even an undo back
  // to the old baseline is new input and must survive notifications until ACK.
  if (!base || replaceDraft || (!documentPending && !dirty())) {
    base = doc
    retainedAfterRead = false
    const start = textarea.selectionStart, end = textarea.selectionEnd, scroll = textarea.scrollTop
    if (textarea.value !== doc.content) textarea.value = doc.content
    textarea.setSelectionRange(start, end); textarea.scrollTop = scroll
    reload.hidden = true
    report(`已保存 · 第 ${doc.revision} 版`)
  } else if (doc.revision !== base.revision) {
    reload.hidden = false
    report('文档已有新版本；你的草稿已保留。请先核对后重新载入。', true)
  }
  viewChanged()
}
async function call(name, args = {}) {
  const result = await app.callServerTool({ name, arguments: args })
  if (result.isError) throw new Error(result.structuredContent?.error?.message || '操作未完成，草稿已保留。')
  return result.structuredContent.document
}
// Register before connect: retain the initial result even if it arrives during initialization.
app.ontoolinput = () => {}
app.ontoolresult = result => { if (!result.isError) receive(result.structuredContent?.document) }
app.ontoolcancelled = () => { report('操作已取消；已保存内容与当前草稿均保留。'); controls() }
app.onteardown = async () => { closed = true; controls(); return {} }
app.onerror = () => report('编辑器连接失败，草稿已保留。', true)
textarea.addEventListener('input', () => { editGeneration++; report('尚未保存'); viewChanged() })
save.addEventListener('click', async () => {
  if (save.disabled || !base) return
  busy = true; documentPending = true; controls(); report('正在保存…')
  const content = textarea.value, expectedRevision = base.revision, submittedGeneration = editGeneration
  try {
    const doc = await call('commit_frame', { content, expectedRevision })
    // A notification can precede the write ACK, and typing can continue while saving.
    base = doc
    retainedAfterRead = false
    if (latest && latest.revision > doc.revision) { reload.hidden = false; report('修改已提交，但已有更新版本；当前内容已保留，请核对后重新载入。', true) }
    else if (editGeneration === submittedGeneration) receive(doc, true)
    else { receive(doc); report(dirty() ? '上次修改已保存；当前修改尚未保存。' : `已保存 · 第 ${doc.revision} 版`) }
  } catch (error) { report(error.message, true); reload.hidden = false }
  finally { busy = false; documentPending = false; viewChanged() }
})
reload.addEventListener('click', async () => {
  if (reload.disabled) return
  // The host owns the editable confirmation; no sandbox modal permission is needed.
  busy = true; documentPending = true; controls()
  const requestedGeneration = editGeneration
  try {
    await changedState
    const doc = await call('read_frame', {})
    if (editGeneration === requestedGeneration) receive(doc, true)
    else {
      // Confirmation covers the draft at request time, not later input. Keep
      // its original baseline so the next save cannot overwrite an unseen edit.
      retainedAfterRead = true
      receive(doc)
      reload.hidden = false
      report('读取期间有新修改；草稿已保留，请核对后重新载入。', true)
    }
  }
  catch (error) { report(error.message, true) }
  finally { busy = false; documentPending = false; viewChanged() }
})
reference.addEventListener('click', async () => {
  if (reference.disabled || !base) return
  const text = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd) || textarea.value
  if (!text.trim() || text.length > 2000) { report('请选择不超过 2000 字符的内容。', true); return }
  busy = true; controls()
  try {
    await changedState
    await app.updateModelContext({ structuredContent: { frameId: base.id, revision: base.revision, text } })
    report('引用已加入反馈草稿，确认发送后才会交给智能助教。')
  } catch { report('暂时无法引用内容，请稍后重试。', true) }
  finally { busy = false; controls() }
})
try {
  await app.connect(new PostMessageTransport(window.parent, window.parent))
  connected = true
  controls(); viewChanged()
  if (!app.getHostCapabilities()?.serverTools) report('此宿主不支持文档编辑。', true)
  textarea.focus()
} catch { report('无法连接编辑器，请使用宿主的重试操作。', true) }
