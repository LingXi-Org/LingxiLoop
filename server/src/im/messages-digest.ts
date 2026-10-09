import { createHash } from 'node:crypto'
import { nativeMessageSchema, type NativeMessage } from './message-types.js'

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function messageAcceptanceDigest(input: { channelId: string; channelType: number; payload: NativeMessage }): string {
  return createHash('sha256').update(canonicalJson({ channelId: input.channelId, channelType: input.channelType,
    payload: { ...nativeMessageSchema.parse(input.payload), createdAt: undefined } })).digest('hex')
}
