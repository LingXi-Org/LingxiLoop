import { centralLimit, montyHallSimulation } from '@/lib/interactive-ui/kernels'

export type ScienceRequest = { kind: 'clt'; input: Parameters<typeof centralLimit>[0] }
  | { kind: 'monty'; input: Parameters<typeof montyHallSimulation>[0] }
export type ScienceResult = { kind: 'clt'; value: ReturnType<typeof centralLimit> }
  | { kind: 'monty'; value: ReturnType<typeof montyHallSimulation> }

globalThis.addEventListener('message', (event: MessageEvent<ScienceRequest>) => {
  try {
    const request = event.data
    const result: ScienceResult = request.kind === 'clt'
      ? { kind: 'clt', value: centralLimit(request.input) }
      : { kind: 'monty', value: montyHallSimulation(request.input) }
    globalThis.postMessage(result)
  } catch { globalThis.postMessage({ error: true }) }
})
