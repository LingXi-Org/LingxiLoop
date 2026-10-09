import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuiState } from '@assistant-ui/react'
import { Renderer, type ActionEvent } from '@openuidev/react-lang'
import { Button } from '@/components/ui/button'
import { OPENUI_CATALOG_VERSION, OPENUI_COMPONENT, OPENUI_RENDERER_VERSION } from '@/lib/interactive-ui/catalog'
import { openUiEnvelopeSchema, uiStateSchema, type OpenUiEnvelope, type UiState, type UiStateResponse } from '@/lib/interactive-ui/protocol'
import { parseLessonSource, validateLessonState } from '@/lib/interactive-ui/source'
import { interactiveApi } from './api'
import { InteractiveContext } from './context'
import { interactiveLibrary } from './library'

class LessonBoundary extends Component<{ children: ReactNode; fallback: string; resetKey: string }, { failed: boolean; resetKey: string }> {
  state = { failed: false, resetKey: this.props.resetKey }
  static getDerivedStateFromError() { return { failed: true } }
  static getDerivedStateFromProps(props: { resetKey: string }, state: { resetKey: string }) {
    return props.resetKey === state.resetKey ? null : { failed: false, resetKey: props.resetKey }
  }
  render() { return this.state.failed ? <p className="whitespace-pre-wrap break-words text-sm">{this.props.fallback}</p> : this.props.children }
}

function checkedResponse(response: UiStateResponse): UiStateResponse {
  const state = uiStateSchema.parse(response.state)
  if (!Number.isSafeInteger(response.version) || response.version < 0 || typeof response.readOnly !== 'boolean'
    || !['committed', 'pending', 'superseded'].includes(response.status) || !Array.isArray(response.resetKeys)
    || response.resetKeys.some(key => typeof key !== 'string')) throw new Error('Invalid exploration state')
  return { ...response, state }
}

function measure(stage: string, start: number) {
  const name = `lingxiloop.ui.${stage}`
  performance.clearMeasures(name)
  performance.measure(name, { start, end: performance.now() })
}

function LessonView({ envelope, conversationId, readOnly }: { envelope: OpenUiEnvelope; conversationId: string; readOnly: boolean }) {
  const started = useRef(performance.now())
  const lesson = useMemo(() => parseLessonSource(envelope.source, { preview: envelope.phase === 'preview' }), [envelope.source, envelope.phase])
  const [restored, setRestored] = useState<UiStateResponse | null>(null), [reload, setReload] = useState(0)
  const [error, setError] = useState(false), [actionError, setActionError] = useState(false)
  const [actionBusy, setActionBusy] = useState(false), [submitted, setSubmitted] = useState(false)
  const version = useRef(0), latest = useRef<UiState>(lesson.defaults), saved = useRef(JSON.stringify(lesson.defaults))
  const blocked = useRef(false), saving = useRef(false), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const lifecycle = useRef<AbortController | null>(null), pendingAction = useRef<{ actionId: string; idempotencyKey: string; state: UiState } | null>(null)
  const performing = useRef(false), acceptedAction = useRef<{ actionId: string; state: string } | null>(null)
  const ready = envelope.phase === 'ready'
  const disabled = !ready || !restored || readOnly || restored.readOnly || restored.status === 'superseded' || error
  const actionsDisabled = disabled || restored.status !== 'committed' || actionBusy || actionError
  const disabledRef = useRef(disabled)
  disabledRef.current = disabled

  useEffect(() => {
    const controller = new AbortController()
    lifecycle.current = controller; blocked.current = false; saving.current = false
    performing.current = false; setActionBusy(false); setActionError(pendingAction.current !== null)
    setRestored(null); setError(false)
    if (!ready) { measure('preview', started.current); return () => controller.abort() }
    const load = async () => {
      try {
        const response = checkedResponse(await interactiveApi.read(conversationId, envelope, controller.signal))
        const state = validateLessonState(lesson, response.state)
        if (controller.signal.aborted) return
        version.current = response.version; latest.current = state; saved.current = JSON.stringify(state)
        setRestored({ ...response, state }); measure('ready', started.current)
      } catch {
        if (!controller.signal.aborted) { blocked.current = true; setError(true) }
      }
    }
    void load()
    return () => { controller.abort(); clearTimeout(timer.current) }
    // Source identity is stable within a committed revision; previews never load personal state.
  }, [conversationId, envelope.uiId, envelope.messageId, envelope.revision, envelope.sourceHash, ready, reload])

  useEffect(() => {
    if (restored?.status !== 'pending') return
    const controller = new AbortController()
    const poll = setInterval(() => {
      void interactiveApi.read(conversationId, envelope, controller.signal).then(checkedResponse).then(response => {
        if (controller.signal.aborted) return
        if (response.status !== 'pending') setReload(value => value + 1)
      }).catch(() => { if (!controller.signal.aborted) { blocked.current = true; setError(true) } })
    }, 1_500)
    return () => { clearInterval(poll); controller.abort() }
  }, [restored?.status, conversationId, envelope.uiId, envelope.revision, envelope.sourceHash])

  const save = useCallback(async function persist() {
    if (blocked.current || saving.current || disabledRef.current || !lifecycle.current || lifecycle.current.signal.aborted) return
    const content = JSON.stringify(latest.current)
    if (content === saved.current) return
    const controller = lifecycle.current
    saving.current = true
    try {
      const response = checkedResponse(await interactiveApi.save(conversationId, envelope, version.current, latest.current, controller.signal))
      if (controller.signal.aborted) return
      version.current = response.version; saved.current = content
      if (response.readOnly || response.status !== 'committed') setRestored(previous => previous && { ...previous, readOnly: response.readOnly, status: response.status })
    } catch {
      if (!controller.signal.aborted) { blocked.current = true; setError(true) }
    } finally {
      saving.current = false
      if (!controller.signal.aborted && !blocked.current && JSON.stringify(latest.current) !== saved.current) timer.current = setTimeout(() => void persist(), 500)
    }
  }, [disabled, conversationId, envelope])

  const update = useCallback((raw: Record<string, unknown>) => {
    if (disabled || blocked.current) return
    const start = performance.now()
    try {
      const state = validateLessonState(lesson, Object.fromEntries(lesson.fields.map(item => [item.key, raw[item.key] ?? latest.current[item.key]])))
      if (JSON.stringify(state) === JSON.stringify(latest.current)) return
      latest.current = state; setSubmitted(false)
      clearTimeout(timer.current); timer.current = setTimeout(() => void save(), 500)
      requestAnimationFrame(() => measure('interaction', start))
    } catch { blocked.current = true; setError(true) }
  }, [disabled, lesson, save])

  const submit = useCallback(async (event?: ActionEvent) => {
    if (performing.current || disabled || restored?.status !== 'committed' || (!event && !pendingAction.current)) return
    if (event) {
      if (actionError || event.type !== 'interaction' || typeof event.params.actionId !== 'string'
        || !envelope.actions.some(action => action.id === event.params.actionId)) return
      if (acceptedAction.current?.actionId === event.params.actionId && acceptedAction.current.state === JSON.stringify(latest.current)) return
      pendingAction.current = { actionId: event.params.actionId, idempotencyKey: crypto.randomUUID(), state: { ...latest.current } }
    }
    performing.current = true; setActionBusy(true); setActionError(false); setSubmitted(false)
    const controller = lifecycle.current
    try {
      await interactiveApi.action(conversationId, envelope, pendingAction.current!, controller?.signal)
      if (controller !== lifecycle.current || controller?.signal.aborted) return
      acceptedAction.current = { actionId: pendingAction.current!.actionId, state: JSON.stringify(pendingAction.current!.state) }
      pendingAction.current = null; setSubmitted(true)
    } catch { if (controller === lifecycle.current && !controller?.signal.aborted) setActionError(true) }
    finally { if (controller === lifecycle.current) { performing.current = false; if (!controller?.signal.aborted) setActionBusy(false) } }
  }, [disabled, restored?.status, actionError, conversationId, envelope])

  return <div className="@container grid min-w-0 gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground" data-interactive-ui={envelope.uiId} data-revision={envelope.revision}>
    {(!ready || !restored && !error) && <p role="status" className="text-xs text-muted-foreground">{ready ? '正在恢复你的探索…' : '正在生成讲解…'}</p>}
    {(readOnly || restored?.readOnly) && <p className="text-xs text-muted-foreground">此版本仅供查看。</p>}
    {restored?.status === 'pending' && <p role="status" className="text-xs text-muted-foreground">讲解正在更新，完成后可提交。</p>}
    {!!restored?.resetKeys.length && <p role="status" className="text-xs text-muted-foreground">部分参数的含义已更新，已恢复为新讲解的初始值。</p>}
    <InteractiveContext.Provider value={{ disabled, actionsDisabled }}>
      <Renderer key={`${reload}:${restored ? 'restored' : 'initial'}`} response={envelope.source} library={interactiveLibrary}
        isStreaming={!ready} initialState={restored?.state ?? lesson.defaults} onStateUpdate={update} onAction={event => void submit(event)} publishObservability={false} />
    </InteractiveContext.Provider>
    {error && <div role="alert" className="grid gap-2 text-sm"><p>探索进度暂时无法保存或恢复，请重新载入后继续。</p>
      <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setReload(value => value + 1)}>重新载入</Button></div>}
    {actionError && <div role="alert" className="grid gap-2 text-sm"><p>提交结果尚未确认，可以重试同一次提交。</p>
      <Button type="button" variant="outline" size="sm" className="w-fit" disabled={disabled || actionBusy} onClick={() => void submit()}>重试提交</Button></div>}
    {submitted && <p role="status" className="text-xs text-muted-foreground">已提交</p>}
    <details className="text-xs text-muted-foreground"><summary className="cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-ring">文字讲解</summary><p className="mt-2 whitespace-pre-wrap break-words">{envelope.fallback}</p></details>
  </div>
}

export function OpenUiLesson({ envelope, conversationId, readOnly = false }: { envelope: OpenUiEnvelope; conversationId: string; readOnly?: boolean }) {
  if (envelope.schemaVersion !== 1 || envelope.catalogVersion !== OPENUI_CATALOG_VERSION || envelope.rendererVersion !== OPENUI_RENDERER_VERSION) {
    return <p className="whitespace-pre-wrap break-words text-sm">{envelope.fallback}</p>
  }
  return <LessonBoundary resetKey={`${envelope.sourceHash}:${envelope.phase}`} fallback={envelope.fallback}>
    <LessonView key={`${conversationId}:${envelope.uiId}:${envelope.revision}:${envelope.phase}`} envelope={envelope} conversationId={conversationId} readOnly={readOnly} />
  </LessonBoundary>
}

export function NativeOpenUiLesson({ value, readOnly }: { value: unknown; readOnly: boolean }) {
  const envelope = openUiEnvelopeSchema.parse(value)
  const message = useAuiState(state => state.message)
  const superseded = useAuiState(state => state.thread.messages.some(candidate => {
    const { sequence, harness } = candidate.metadata.custom
    if (typeof sequence !== 'number' || sequence <= 0 || !Number.isSafeInteger(sequence)
      || harness && (typeof harness !== 'object' || Reflect.get(harness, 'delivery') !== 'delivered')) return false
    return candidate.content.some(part => {
      if (part.type !== 'generative-ui') return false
      const roots = Array.isArray(part.spec.root) ? part.spec.root : [part.spec.root]
      return roots.some(root => typeof root === 'object' && root.component === OPENUI_COMPONENT
        && root.props?.uiId === envelope.uiId && typeof root.props.revision === 'number' && root.props.revision > envelope.revision && root.props.phase === 'ready')
    })
  }))
  const conversationId = message.metadata.custom.conversationId
  if (typeof conversationId !== 'string' || envelope.messageId !== message.id) return <p className="text-sm">{envelope.fallback}</p>
  return <OpenUiLesson envelope={envelope} conversationId={conversationId} readOnly={readOnly || superseded} />
}
