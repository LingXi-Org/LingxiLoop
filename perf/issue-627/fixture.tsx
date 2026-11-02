// Browser replay of real local Worker projections; no live model or production API.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantRuntimeProvider, ThreadPrimitive, useExternalStoreRuntime, type ThreadMessageLike } from '@assistant-ui/react'
import { NativeMessageContent } from '../../src/features/chat/components/NativeMessageContent'
import { TooltipProvider } from '../../src/components/ui/tooltip'
import '../../src/styles/globals.css'
const partial = await (await fetch('./evidence/partial-retry.json')).json()
const cancel = await (await fetch('./evidence/cancel.json')).json()
const stages = [...partial.snapshots, ...cancel.snapshots] as { stage: string; message: ThreadMessageLike }[]
function Preview() {
  const [stage, setStage] = useState(new URLSearchParams(location.search).get('stage') ?? 'partial-running')
  const source = stages.find(item => item.stage === stage) ?? stages[0]
  const runtime = useExternalStoreRuntime({ messages: [source.message], convertMessage: message => ({ ...message, createdAt: new Date(message.createdAt!) }), isRunning: source.message.status?.type === 'running', onNew: async () => {} })
  return <TooltipProvider><main className="mx-auto grid max-w-3xl gap-8 p-6"><nav className="flex flex-wrap gap-3" aria-label="回放状态">{stages.map(item => <button type="button" key={item.stage} data-stage={item.stage} className="rounded border px-3 py-1 text-sm" onClick={() => { history.replaceState(null, '', `?stage=${item.stage}`); setStage(item.stage) }}>{item.stage}</button>)}</nav><AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Messages components={{ Message: NativeMessageContent }} /></AssistantRuntimeProvider></main></TooltipProvider>
}
createRoot(document.getElementById('root')!).render(<Preview />)
