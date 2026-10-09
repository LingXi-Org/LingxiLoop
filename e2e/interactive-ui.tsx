import { lazy, Suspense, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/globals.css'
import { OpenUiLesson } from '@/features/chat/components/interactive-ui/OpenUiLesson'
import { CltPlot } from '@/features/chat/components/interactive-ui/science'
import { parseLessonSource } from '@/lib/interactive-ui/source'
import { OPENUI_CATALOG_VERSION, OPENUI_RENDERER_VERSION } from '@/lib/interactive-ui/catalog'
import type { OpenUiEnvelope, UiState } from '@/lib/interactive-ui/protocol'

if (!import.meta.env.DEV && import.meta.env.MODE !== 'interactive-test') throw new Error('This fixture requires the isolated test build')
const params = new URLSearchParams(location.search), mode = params.get('mode') ?? 'ready', science = params.get('scenario') === 'science'
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark')
const fallback = '角度为45度时，在同一高度落地的射程最大。'
const source = `$angle = 45
$step = 0
$prediction = ""
root = Lesson("运动与选择", "${fallback}", [angle,plot,steps,prediction,table,explain${science ? ',functions,dct,clt,monty' : ''}])
angle = Parameter("angle", "发射角度", $angle, 0, 90, 1, "°", "projectile.angle")
plot = ProjectilePlot($angle, 20, 9.81, 0)
steps = Steps("step", "探索步骤", $step, [{title:"先预测",text:"改变角度会怎样影响射程？"},{title:"再比较",text:"比较同一速度下不同角度的射程。"}])
prediction = Prediction("prediction", "你的预测", $prediction)
table = Table(["条件", "结论"], [["相同速度与起落高度", "45°时射程最大"], ["存在空气阻力", "需要不同模型"]])
explain = LearningAction("explain", "explain", "解释当前结果")
${science ? 'functions = FunctionPlot([{id:"直线",a:0,b:1,c:0},{id:"抛物线",a:1,b:0,c:0}], [-2,2])\ndct = DctImage(64,8)\nclt = CltPlot("uniform",30,5000,11)\nmonty = MontyHall(0,true,true,5000,4)' : ''}`
const lesson = parseLessonSource(source)
const sourceHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source)))].map(value => value.toString(16).padStart(2, '0')).join('')
const envelope: OpenUiEnvelope = { schemaVersion: 1, catalogVersion: OPENUI_CATALOG_VERSION, rendererVersion: OPENUI_RENDERER_VERSION,
  uiId: 'fixture-ui', messageId: 'fixture-message', runId: 'fixture-run', revision: 1, baseRevision: 0,
  source: mode === 'invalid' ? 'root = UnknownUnsafeComponent()' : source, sourceHash, fallback,
  phase: mode === 'draft' ? 'preview' : 'ready', fields: lesson.fields, actions: lesson.actions,
}
const storageKey = `interactive-fixture:${params.get('theme') ?? ''}:${science}:${mode}`
const explorations = new Map<string, { state: UiState; version: number }>()
let saves = 0, actions = 0
let nextCommitted = false
const identities = new Set<string>()
let publish = () => {}
const originalFetch = window.fetch.bind(window)
window.fetch = async (input, init) => {
  const url = String(input)
  const uiId = /^\/api\/im\/channels\/fixture-room\/ui\/(fixture-ui(?:-\d+)?)\//.exec(url)?.[1]
  if (!uiId) return originalFetch(input, init)
  let exploration = explorations.get(uiId)
  if (!exploration) {
    exploration = { state: JSON.parse(localStorage.getItem(`${storageKey}:${uiId}`) ?? 'null') ?? lesson.defaults, version: 0 }
    explorations.set(uiId, exploration)
  }
  if (url.includes('/actions')) {
    actions++
    const body = JSON.parse(String(init?.body)) as { idempotencyKey: string }
    identities.add(body.idempotencyKey); publish()
    if (mode === 'action-retry' && actions === 1) return Response.json({ error: 'Unconfirmed synthetic receipt' }, { status: 503 })
    if (mode === 'action-reload' && actions === 1) return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Request aborted before receipt', 'AbortError')), { once: true })
    })
    return Response.json({ status: 'accepted' })
  }
  if (init?.method === 'PUT') {
    saves++; publish()
    const body = JSON.parse(String(init.body)) as { state: UiState; expectedVersion: number }
    if (mode === 'save-conflict' || mode === 'action-reload' || body.expectedVersion !== exploration.version) return Response.json({ error: 'Synthetic state conflict' }, { status: 409 })
    exploration.state = body.state; exploration.version++; localStorage.setItem(`${storageKey}:${uiId}`, JSON.stringify(exploration.state))
  }
  const nextPending = mode === 'revision-pending' && new URL(url, location.href).searchParams.get('revision') === '2' && !nextCommitted
  return Response.json({ ...exploration, readOnly: mode === 'pending' || mode === 'stale' || nextPending,
    status: mode === 'pending' || nextPending ? 'pending' : mode === 'stale' ? 'superseded' : 'committed', resetKeys: [],
  })
}

function Fixture() {
  const [, refresh] = useState(0)
  publish = () => refresh(value => value + 1)
  return <main className="mx-auto max-w-3xl space-y-4 p-4">
    <p className="text-sm text-muted-foreground">组件验收：合成消息与个人状态接口</p>
    <div data-fixture-saves={saves} data-fixture-actions={actions} data-fixture-action-identities={identities.size} />
    {Array.from({ length: params.has('long') ? 20 : 1 }, (_, index) => <OpenUiLesson key={index}
      envelope={params.has('long') ? { ...envelope, uiId: `fixture-ui-${index}`, messageId: `fixture-message-${index}` } : envelope} conversationId="fixture-room" />)}
  </main>
}
function WorkerFixture() {
  const [sampleSize, setSampleSize] = useState(5)
  return <main className="mx-auto max-w-3xl p-4"><button type="button" onClick={() => setSampleSize(value => value + 1)}>增加样本量</button>
    <p>当前样本量：{sampleSize}</p><div style={{ height: 1600 }} aria-hidden="true" />
    <CltPlot distribution="uniform" sampleSize={sampleSize} trials={5000} seed={11} />
  </main>
}
const NativeRevisionFixture = lazy(() => import('./interactive-ui-native'))
createRoot(document.getElementById('root')!).render(params.get('scenario') === 'worker' ? <WorkerFixture /> : mode === 'revision-pending'
  ? <Suspense><NativeRevisionFixture envelope={envelope} onCommit={() => { nextCommitted = true }} /></Suspense> : <Fixture />)
