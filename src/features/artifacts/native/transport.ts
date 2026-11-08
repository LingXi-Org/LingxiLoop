import { http } from '@/api/core/http'
import type { NativeTransport } from './session'
export function nativeTransport(artifactId: string, revisionSeq?:string): NativeTransport {
  const base = `/artifacts/${encodeURIComponent(artifactId)}`
  const documentPath=revisionSeq===undefined?`${base}/document`:`${base}/revisions/${encodeURIComponent(revisionSeq)}/document`
  const readonly=()=>Promise.reject(new Error('历史版本仅供预览。'))
  return {
    read: signal => http(documentPath, { signal }),
    page: (pageId, version, signal) => http(`${base}/pages/${encodeURIComponent(pageId)}?hash=${encodeURIComponent(version)}`, { signal, priority:'high' }),
    all: signal => http(`${documentPath}?allPages=true`, { signal }),
    commit: revisionSeq===undefined?(batch, signal) => http(`${base}/operations`, { method: 'POST', body: JSON.stringify(batch), signal }):readonly,
    history: revisionSeq===undefined?(kind, targetOperationId, expectedHistoryVersion, operationId) => http(`${base}/operations`, { method: 'POST', body: JSON.stringify({ kind, targetOperationId, expectedHistoryVersion, operationId }) }):readonly,
    changed: async (afterSeq, signal) => { if(revisionSeq!==undefined)return false;const result = await http<{ items: unknown[]; seq: number }>(`${base}/changes?afterSeq=${afterSeq}`, { signal }); return result.items.length > 0 || result.seq > afterSeq },
  }
}
