import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { TraceWaterfall } from '@/components/trace-waterfall/trace-waterfall'
import { readRunTrace, type RunTrace } from '@/lib/runTrace'
import type { TerminalRunTraceReference } from '@/lib/terminalRunTrace'
import { harnessApi, type AgentRunTarget } from '../runtime/harness-api'

/** A terminal IM receipt keeps a small identity, not a copy of descendant traces. */
export function TerminalRunTrace({ target, reference }: { target: AgentRunTarget; reference: TerminalRunTraceReference }) {
  const request = useRef<AbortController | null>(null)
  const [trace,setTrace] = useState<RunTrace>(), [pending,setPending] = useState(false), [failed,setFailed] = useState(false)
  useEffect(()=>()=>{request.current?.abort()},[])
  const load = async () => {
    request.current?.abort()
    const controller = new AbortController();request.current=controller;setPending(true);setFailed(false)
    try {
      const snapshot = await harnessApi.readTerminalTrace(target,reference,controller.signal)
      const next = readRunTrace(snapshot.message.metadata.custom.runTrace)
      if (!next) throw new Error('trace unavailable')
      if (!controller.signal.aborted) setTrace(next)
    } catch { if (!controller.signal.aborted) setFailed(true) }
    finally { if (!controller.signal.aborted) setPending(false) }
  }
  return <div data-slot="terminal-run-trace" className="grid gap-2">
    {trace ? <TraceWaterfall trace={trace} /> : <Button variant="ghost" size="sm" disabled={pending} onClick={()=>void load()}>
      {pending ? '正在读取运行时间线…' : failed ? '重试读取运行时间线' : '查看运行时间线'}
    </Button>}
    {failed && <p role="alert" className="text-sm text-muted-foreground">暂时无法读取这次运行的时间线；记录可能已更新或访问权限已变化。</p>}
  </div>
}
