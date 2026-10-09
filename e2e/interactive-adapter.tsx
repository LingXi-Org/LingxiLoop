import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantRuntimeProvider, MessagePrimitive, ThreadPrimitive, useExternalStoreRuntime } from '@assistant-ui/react'
import { Renderer } from '@openuidev/react-lang'
import { createOpenUIPresent } from '../.e2e/openui-adapter-compatible/node_modules/@openuidev/assistant-ui/dist/index.mjs'
import '../.e2e/openui-adapter-compatible/node_modules/@openuidev/react-ui/dist/layered/styles/index.css'
import '@/styles/globals.css'
import { createNativeMessage, deserializeMessage } from '@/lib/nativeMessage'
import { InteractiveContext } from '@/features/chat/components/interactive-ui/context'
import { interactiveLibrary } from '@/features/chat/components/interactive-ui/library'

if (import.meta.env.MODE !== 'interactive-test') throw new Error('Build this comparison through the isolated interactive-test configuration')
document.documentElement.classList.toggle('dark', new URLSearchParams(location.search).get('theme') === 'dark')
const source = '$angle = 45\nroot = Lesson("角度与射程", "同高度无阻力时45度的射程最大。", [angle,plot,explain])\nangle = Parameter("angle", "发射角度", $angle, 0,90,1,"°","projectile.angle")\nplot = ProjectilePlot($angle,20,9.81,0)\nexplain = LearningAction("explain","explain","解释当前结果")'
const Present = createOpenUIPresent({ library: interactiveLibrary, disableThemeProvider: true, rendererProps: { publishObservability: false } })
const messages = [deserializeMessage(createNativeMessage({ id: 'm0-adapter', role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'm0-present',
  toolName: 'present_openui', args: { ui: source }, argsText: JSON.stringify({ ui: source }), result: { displayed: true } }] }))]
function AdapterMessage() {
  return <MessagePrimitive.Root><MessagePrimitive.Parts components={{ tools: { by_name: { present_openui: Present } } }} /></MessagePrimitive.Root>
}
function Comparison() {
  const [actions, setActions] = useState(0), [appends, setAppends] = useState(0)
  const runtime = useExternalStoreRuntime({ messages, isRunning: false, onNew: async () => { setAppends(value => value + 1) } })
  return <InteractiveContext.Provider value={{ disabled: false, actionsDisabled: false }}><main className="mx-auto grid max-w-3xl gap-5 p-4">
    <h1>Direct Renderer / official adapter</h1><div data-direct-actions={actions} data-adapter-appends={appends} />
    <section data-m0-variant="direct" className="grid gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground"><h2>Direct Renderer</h2>
      <Renderer response={source} library={interactiveLibrary} publishObservability={false} onAction={() => setActions(value => value + 1)} />
    </section>
    <section data-m0-variant="adapter" className="grid gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground"><h2>Official present_openui adapter</h2>
      <AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Root><ThreadPrimitive.Messages components={{ Message: AdapterMessage }} /></ThreadPrimitive.Root></AssistantRuntimeProvider>
    </section>
  </main></InteractiveContext.Provider>
}
createRoot(document.getElementById('root')!).render(<Comparison />)
