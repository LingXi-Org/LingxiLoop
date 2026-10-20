import { AppBridge, PostMessageTransport, type McpUiHostCapabilities } from '@modelcontextprotocol/ext-apps/app-bridge'
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { getWorkspaceSession } from '@/lib/workspaceSession'
import { getActiveCompanyId, useAuth } from '@/stores/auth'
import { canvasApi } from '../api'
import type { CanvasFrame } from '../contracts'
import { canvasAppTools, canvasDocument, canvasReferenceSchema, commitFrameSchema, emptyArgumentsSchema, viewStateRequestSchema, type CanvasReference } from './contract'
import { canvasAppDocument } from './document'

export const canvasAppCapabilities: McpUiHostCapabilities = {
  serverTools: {}, updateModelContext: { structuredContent: {} },
  experimental: { 'zcode/widgetState': {} },
}
const owners = new WeakMap<HTMLIFrameElement, symbol>()

// SDK validates JSON-RPC + source. Add the opaque-origin boundary before dispatch.
class OpaqueAppTransport extends PostMessageTransport {
  private readonly rejectOrigin = (event: MessageEvent) => {
    if (event.source === this.source && event.origin !== 'null') event.stopImmediatePropagation()
  }
  constructor(private readonly source: Window) { super(source, source) }
  override async start() { window.addEventListener('message', this.rejectOrigin, true); await super.start() }
  override async close() { window.removeEventListener('message', this.rejectOrigin, true); await super.close() }
}

export function createCanvasAppHost(input: {
  iframe: HTMLIFrameElement; frame: CanvasFrame
  onFrame(frame: CanvasFrame): void
  onReference(reference: CanvasReference): void
  onPhase(phase: 'connecting' | 'ready' | 'error'): void
  onDirty(dirty: boolean): void
  confirmReload(): Promise<boolean>
}) {
  const user = useAuth.getState().user?.id ?? null
  const company = getActiveCompanyId()
  const workspace = getWorkspaceSession()
  let latest = input.frame
  let closed = false, initialized = false, dirty = false, loads = 0, committing = false
  const lifetime = new AbortController()
  const generation = Symbol('canvas-app')
  owners.set(input.iframe, generation)
  const frameWindow = input.iframe.contentWindow
  if (!frameWindow) throw new Error('Canvas editor frame is unavailable')
  const bridge = new AppBridge(null, { name: 'LingxiLoop', version: '1.0.0' }, canvasAppCapabilities, {
    hostContext: { displayMode: 'inline', availableDisplayModes: ['inline'], locale: 'zh-CN', 'zcode/widgetState': { dirty: false } },
  })
  const scopeValid = () => {
    const current = getWorkspaceSession()
    return user === (useAuth.getState().user?.id ?? null) && company === getActiveCompanyId()
      && current?.companyId === workspace?.companyId && current?.projectId === workspace?.projectId
  }
  const assertCurrent = (interactive = false) => {
    if (closed || owners.get(input.iframe) !== generation || !scopeValid() || !input.iframe.isConnected || (interactive && (!initialized || !input.iframe.checkVisibility() || document.visibilityState === 'hidden'))) {
      throw new Error('Canvas editor is no longer active')
    }
  }
  const result = (frame: CanvasFrame) => ({ content: [{ type: 'text' as const, text: `Canvas document revision ${frame.revision}` }], structuredContent: { document: canvasDocument(frame) } })
  const feed = () => { if (!closed && initialized) void bridge.sendToolResult(result(latest)).catch(fail) }
  const accept = (frame: CanvasFrame) => {
    assertCurrent()
    if (frame.id !== latest.id || frame.canvasId !== latest.canvasId || !['markdown', 'document'].includes(frame.type)) throw new Error('Canvas document changed')
    if (frame.revision < latest.revision) return
    latest = frame; input.onFrame(frame); feed()
  }
  const read = async (signal?: AbortSignal) => {
    assertCurrent()
    const snapshot = await canvasApi.getCanvas(latest.canvasId, signal)
    assertCurrent()
    const frame = snapshot.frames.find(frame => frame.id === latest.id)
    if (!frame) throw new Error('Canvas document is no longer available')
    accept(frame)
    return frame
  }
  function fail() {
    if (closed) return
    input.onPhase('error')
    // A failed channel must not erase a same-scope draft. Disconnect it and
    // leave a read-only page for copying; revoked scope/navigation clears it.
    void dispose(!scopeValid() || !initialized || loads > 1)
  }
  const timer = window.setTimeout(fail, 15_000)
  bridge.oninitialized = () => {
    if (closed || initialized) return
    initialized = true; window.clearTimeout(timer)
    input.onPhase('ready')
    // Input precedes result; fetch latest at handshake completion, not construction.
    void bridge.sendToolInput({ arguments: { frameId: latest.id } }).then(feed).catch(fail)
  }
  bridge.setRequestHandler(ListToolsRequestSchema, async () => { assertCurrent(); return { tools: canvasAppTools } })
  bridge.oncalltool = async (params, ctx) => {
    assertCurrent(true)
    const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(20_000), ...(ctx.mcpReq?.signal ? [ctx.mcpReq.signal] : [])])
    signal.throwIfAborted()
    if (params.name === 'read_frame') {
      emptyArgumentsSchema.parse(params.arguments ?? {})
      if (dirty && !await input.confirmReload()) throw new Error('Reload cancelled; draft retained')
      assertCurrent(true); signal.throwIfAborted()
      return result(await read(signal))
    }
    if (params.name !== 'commit_frame') throw new Error('Unsupported Canvas app tool')
    const args = commitFrameSchema.parse(params.arguments)
    if (committing) throw new Error('A Canvas save is already pending')
    committing = true
    try {
      const frame = await canvasApi.updateCanvasFrame(latest.id, { content: args.content, baseRevision: args.expectedRevision }, signal)
      assertCurrent(); signal.throwIfAborted(); accept(frame)
      return result(frame)
    } catch (error) {
      // An interrupted response may already have committed. Reconcile by an
      // authorized read; never change expectedRevision and blindly retry a write.
      assertCurrent()
      if (ctx.mcpReq?.signal?.aborted) throw error
      let frame: CanvasFrame | undefined
      try { frame = await read(AbortSignal.any([lifetime.signal, AbortSignal.timeout(5000)])) } catch { /* Keep the draft and report uncertainty. */ }
      assertCurrent()
      if (frame && frame.revision > args.expectedRevision && frame.content === args.content) return result(frame)
      return { isError: true, content: [{ type: 'text' as const, text: 'Canvas save was not confirmed' }], structuredContent: { error: {
        code: frame && frame.revision !== args.expectedRevision ? 'revision_conflict' : 'save_unconfirmed',
        message: frame && frame.revision !== args.expectedRevision ? '文档已有新版本；你的草稿已保留，请核对后重新载入。' : '保存未确认，草稿已保留。请检查连接后重试。',
      } } }
    } finally { committing = false }
  }
  bridge.onupdatemodelcontext = async params => {
    assertCurrent(true)
    if (params.content?.length) throw new Error('Only a bound Canvas reference is supported')
    const reference = canvasReferenceSchema.parse(params.structuredContent)
    if (dirty || reference.frameId !== latest.id || reference.revision !== latest.revision || !latest.content.includes(reference.text)) throw new Error('Reference no longer matches the saved Canvas document')
    // Staging is not an Agent invocation. The outer editable dialog owns send/cancel.
    input.onReference({ ...reference, title: latest.title })
    return {}
  }
  bridge.setRequestHandler(viewStateRequestSchema, async request => {
    assertCurrent()
    dirty = request.params.widgetState.dirty
    input.onDirty(dirty)
    return {}
  })
  const onLoad = () => { if (++loads > 1) fail() }
  input.iframe.addEventListener('load', onLoad)
  const workspaceChanged = () => { if (!scopeValid()) { input.onPhase('error'); void dispose() } }
  const unsubscribe = useAuth.subscribe(workspaceChanged)
  window.addEventListener('lingxiloop-workspace-changed', workspaceChanged)
  const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = '' } }
  window.addEventListener('beforeunload', beforeUnload)
  const transport = new OpaqueAppTransport(frameWindow)
  void bridge.connect(transport).then(() => { if (!closed) input.iframe.srcdoc = canvasAppDocument() }).catch(fail)
  async function dispose(clearDocument = true) {
    if (!closed) {
      closed = true; lifetime.abort(); window.clearTimeout(timer)
      if (initialized) await bridge.teardownResource({}, { timeout: 500 }).catch(() => undefined)
      await bridge.close().catch(() => undefined)
    }
    if (!clearDocument) return
    unsubscribe(); input.iframe.removeEventListener('load', onLoad)
    window.removeEventListener('lingxiloop-workspace-changed', workspaceChanged)
    window.removeEventListener('beforeunload', beforeUnload)
    // A late teardown belongs only to its captured instance, never a retry's guest.
    if (owners.get(input.iframe) === generation) {
      owners.delete(input.iframe)
      input.iframe.removeAttribute('srcdoc')
    }
  }
  return {
    update(frame: CanvasFrame) {
      if (closed) return
      if (!scopeValid() || frame.type !== latest.type) { fail(); return }
      if (frame.id === latest.id && frame.canvasId === latest.canvasId && frame.revision > latest.revision) { latest = frame; feed() }
    },
    dispose,
  }
}
