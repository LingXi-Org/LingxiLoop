import { http } from '@/api/core/http'
import type { NativeTransport } from './session'
export function nativeTransport(artifactId: string): NativeTransport {
  const base = `/artifacts/${encodeURIComponent(artifactId)}`
  return {
    read: signal => http(`${base}/document`, { signal }),
    page: (pageId, version, signal) => http(`${base}/pages/${encodeURIComponent(pageId)}?hash=${encodeURIComponent(version)}`, { signal }),
    all: signal => http(`${base}/document?allPages=true`, { signal }),
    commit: (batch, signal) => http(`${base}/operations`, { method: 'POST', body: JSON.stringify(batch), signal }),
    history: (kind, targetOperationId, expectedHistoryVersion, operationId) => http(`${base}/operations`, { method: 'POST', body: JSON.stringify({ kind, targetOperationId, expectedHistoryVersion, operationId }) }),
    changed: async (afterSeq, signal) => { const result = await http<{ items: unknown[]; seq: number }>(`${base}/changes?afterSeq=${afterSeq}`, { signal }); return result.items.length > 0 || result.seq > afterSeq },
  }
}
