import { MAX_ARTIFACT_RECOVERY_BYTES } from '../../../../shared/artifact-recovery'
import type { ArtifactKind } from '../contracts'
export class RecoveryHandoffError extends Error {}

export function requestArtifactRecovery(frame: HTMLIFrameElement, url: string, kind: ArtifactKind, nonce: string, command: 'snapshot' | 'status' | 'inspect' | 'restore', signal: AbortSignal, bytes?: ArrayBuffer): Promise<{ result: string; bytes?: ArrayBuffer; id?: string }> {
  signal.throwIfAborted()
  const source = frame.contentWindow
  if (!source) return Promise.reject(new RecoveryHandoffError('编辑器未就绪，原页面已保留。'))
  const origin = new URL(url, location.href).origin
  const expected = origin === location.origin ? 'null' : origin
  // Opaque legacy frames can return their own snapshot, but must not receive
  // private recovery data addressed with a wildcard target origin.
  if (bytes && expected === 'null') return Promise.reject(new RecoveryHandoffError('此旧版页面需要先下载本地副本。'))
  const requestId = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    const stop = () => { clearTimeout(timer);window.removeEventListener('message', receive);signal.removeEventListener('abort', abort) }
    const abort = () => { stop();reject(signal.reason) }
    const receive = (event: MessageEvent) => {
      const value = event.data
      if (event.source !== source || event.origin !== expected || value?.type !== 'artifact:recovery-response' || value.nonce !== nonce || value.requestId !== requestId) return
      if (!['clean', 'snapshot', 'loading', 'ready', 'restorable', 'changed', 'readonly', 'incompatible', 'restored', 'pending', 'unavailable'].includes(value.result)) return
      let id: string | undefined
      if (value.result === 'snapshot') {
        if (!(value.bytes instanceof ArrayBuffer) || !value.bytes.byteLength || value.bytes.byteLength > MAX_ARTIFACT_RECOVERY_BYTES) return
        try {
          const packet = JSON.parse(new TextDecoder().decode(value.bytes))
          if (packet.format !== 'lingxi-editor-recovery-v1' || packet.kind !== kind || typeof packet.id !== 'string' || packet.id.length > 100
            || !(packet.baseSha === null || /^[a-f0-9]{64}$/.test(packet.baseSha)) || typeof packet.state?.title !== 'string' || packet.state.title.length > 2000
            || !packet.state.content || typeof packet.state.content !== 'object' || Array.isArray(packet.state.content)) return
          id = packet.id
        } catch { return }
      }
      stop();resolve({ result: value.result, bytes: value.result === 'snapshot' ? value.bytes : undefined, id })
    }
    const timer = setTimeout(() => { stop();reject(new RecoveryHandoffError('未能转移本地更改，原编辑器仍保留。请重试或先处理本地副本。')) }, 5000)
    window.addEventListener('message', receive)
    signal.addEventListener('abort', abort, { once: true })
    source.postMessage({ type: 'artifact:recovery-request', kind, nonce, requestId, command, bytes }, expected === 'null' ? '*' : origin, bytes ? [bytes] : [])
  })
}
