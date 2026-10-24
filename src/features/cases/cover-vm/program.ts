import { invalidCoverData } from './protocol'

export const COVER_PROGRAM_BYTES = 131072
export type CoverProgram = { version: 2; engine: 'quickjs-wasm'; kernel: string; figure: string }
export function parseCoverProgram(json: string): CoverProgram {
  if (typeof json !== 'string' || json.length > COVER_PROGRAM_BYTES || new TextEncoder().encode(json).length > COVER_PROGRAM_BYTES) invalidCoverData()
  const value: unknown = JSON.parse(json)
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalidCoverData()
  const program = value as Record<string, unknown>
  if (Object.keys(program).sort().join(',') !== 'engine,figure,kernel,version' || program.version !== 2 || program.engine !== 'quickjs-wasm') invalidCoverData()
  for (const key of ['kernel', 'figure']) {
    if (typeof program[key] !== 'string' || !program[key] || program[key].length > 65536 || program[key].includes('\0')) invalidCoverData()
  }
  return program as CoverProgram
}

export type CoverVmEvent =
  | { type: 'tick'; delta: number }
  | { type: 'environment'; visible: boolean; reducedMotion: boolean }
  | { type: 'pointer'; kind: 'pointermove' | 'pointerdown' | 'pointerleave'; x: number; y: number; pointerType: 'mouse' | 'touch' | 'pen' }
  | { type: 'focus'; focused: boolean }

export function validateCoverEvent(value: unknown): CoverVmEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalidCoverData()
  const event = value as Record<string, unknown>, keys = Object.keys(event).sort().join(',')
  switch (event.type) {
    case 'tick':
      if (keys !== 'delta,type' || typeof event.delta !== 'number' || !Number.isFinite(event.delta) || event.delta < 0 || event.delta > 50) invalidCoverData()
      break
    case 'environment':
      if (keys !== 'reducedMotion,type,visible' || typeof event.visible !== 'boolean' || typeof event.reducedMotion !== 'boolean') invalidCoverData()
      break
    case 'focus':
      if (keys !== 'focused,type' || typeof event.focused !== 'boolean') invalidCoverData()
      break
    case 'pointer':
      if (keys !== 'kind,pointerType,type,x,y' || !['pointermove', 'pointerdown', 'pointerleave'].includes(String(event.kind)) || !['mouse', 'touch', 'pen'].includes(String(event.pointerType)) || typeof event.x !== 'number' || typeof event.y !== 'number' || !Number.isFinite(event.x) || !Number.isFinite(event.y) || event.x < 0 || event.x > 400 || event.y < 0 || event.y > 320) invalidCoverData()
      break
    default: invalidCoverData()
  }
  return event as CoverVmEvent
}
