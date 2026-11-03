/** A single native editor's bounded, in-memory recovery handoff. No persistent
 * browser cache, server write, grant renewal or cross-artifact lookup lives here. */
export const MAX_ARTIFACT_RECOVERY_BYTES = 16 * 1024 * 1024
type State = { title: string; content: unknown }
type NativeDocument = {
  title(): string; content(): unknown; dirty(): boolean; readOnly(): boolean
  shown?(): boolean; loadState?(): string
  setContent(content: unknown): void; setTitle(title: string): void; save(): Promise<unknown>
  subscribeSave(callback: () => void): () => void; subscribeLoad?(callback: () => void): () => void
}
type Package = { format: 'lingxi-editor-recovery-v1'; kind: 'design' | 'slides'; id: string; baseSha: string | null; state: State }
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value, (_key, value) => value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value))
const digestBytes = async (bytes: Uint8Array<ArrayBuffer>) => {
  if (bytes.length > MAX_ARTIFACT_RECOVERY_BYTES) throw Error('本地副本过大，原编辑器已保留。')
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('')
}
const digest = (state: State) => digestBytes(encode(state))
const sameBytes = (left: Uint8Array, right: Uint8Array) => left.length === right.length && left.every((byte, index) => byte === right[index])

export function createArtifactRecovery(kind: 'design' | 'slides', doc: NativeDocument, parse: (content: unknown) => unknown) {
  const read = (): State => ({ title: doc.title(), content: doc.content() })
  const live = () => doc.shown?.() ?? doc.loadState?.() === 'live'
  let baseSha: string | null = null, checkpoint = Promise.resolve(), generation = 0, restoredSha: string | null = null
  const confirm = () => {
    if (!live() || doc.dirty()) return checkpoint
    const state = read(), sequence = ++generation
    checkpoint = digest(state).then(sha => { if (sequence === generation) baseSha = sha })
    return checkpoint
  }
  function unpack(bytes: ArrayBuffer): Package {
    if (!bytes.byteLength || bytes.byteLength > MAX_ARTIFACT_RECOVERY_BYTES) throw Error('本地副本无法读取，原副本仍保留。')
    const data = JSON.parse(new TextDecoder().decode(bytes)) as Package
    if (data?.format !== 'lingxi-editor-recovery-v1' || data.kind !== kind || typeof data.id !== 'string' || data.id.length > 100
      || !(data.baseSha === null || /^[a-f0-9]{64}$/.test(data.baseSha)) || typeof data.state?.title !== 'string'
      || data.state.title.length > 2000 || !data.state.content || typeof data.state.content !== 'object') throw Error('本地副本格式不匹配。')
    return data
  }
  let validated: State | null = null
  const unchanged = (state: State) => doc.content() === state.content && doc.title() === state.title
  async function inspect(bytes: ArrayBuffer) {
    validated = null
    const data = unpack(bytes)
    if (!live()) return 'loading'
    if (doc.readOnly()) return 'readonly'
    const before = read()
    if (doc.dirty() || !data.baseSha || await digest(before) !== data.baseSha) return 'changed'
    // The current native parser must accept every field; normalization must
    // not silently drop content from a different editor/schema version.
    const parsed = parse(data.state.content)
    if (await digest({ ...data.state, content: parsed }) !== await digest(data.state)) return 'incompatible'
    if (doc.readOnly()) return 'readonly'
    if (doc.dirty() || !unchanged(before)) return 'changed'
    validated = before
    return 'restorable'
  }
  return {
    confirm,
    status: () => !live() ? 'loading' : doc.readOnly() ? 'readonly' : 'ready',
    async snapshot() {
      if (!live()) throw Error('编辑器尚未就绪，原页面已保留。')
      await checkpoint.catch(() => {})
      const state = read()
      if (!doc.dirty() && baseSha) {
        const before = encode(state)
        const sha = await digestBytes(before)
        // Native content may change while Web Crypto is hashing. Check the
        // current model synchronously after that await before telling the
        // parent it may discard this iframe.
        if (sha === baseSha && !doc.dirty() && sameBytes(before, encode(read()))) return { result: 'clean' as const }
      }
      const current = read()
      const bytes = encode({ format: 'lingxi-editor-recovery-v1', kind, id: crypto.randomUUID(), baseSha, state: current } satisfies Package)
      if (bytes.length > MAX_ARTIFACT_RECOVERY_BYTES) throw Error('本地副本过大，原编辑器已保留。')
      return { result: 'snapshot' as const, bytes: bytes.buffer }
    },
    inspect,
    async settled() {
      if (!restoredSha || doc.dirty()) return { saved: false, exact: false }
      const before = read()
      const exact = await digest(before) === restoredSha
      return { saved: unchanged(before) && !doc.dirty(), exact }
    },
    async restore(bytes: ArrayBuffer) {
      restoredSha = null
      const data = unpack(bytes)
      if (await inspect(bytes) !== 'restorable') throw Error('服务器内容或权限已变化，请下载本地副本后比较。')
      if (!validated || !unchanged(validated) || doc.dirty() || doc.readOnly()) throw Error('编辑器状态已变化，本地副本仍保留。')
      // Only an explicit, freshly authorized parent action reaches this path.
      // Native persistence retains its normal CAS/conflict and retry behavior.
      restoredSha = await digest(data.state)
      if (!validated || !unchanged(validated) || doc.dirty() || doc.readOnly()) throw Error('编辑器状态已变化，本地副本仍保留。')
      doc.setContent(parse(data.state.content));doc.setTitle(data.state.title)
      await doc.save()
      return !doc.dirty() && await digest(read()) === await digest(data.state) ? 'restored' : 'pending'
    },
  }
}

let disconnect: (() => void) | undefined
export function installArtifactRecovery(kind: 'design' | 'slides', doc: NativeDocument, parse: (content: unknown) => unknown) {
  if (typeof window === 'undefined' || window.parent === window) return
  disconnect?.()
  const recovery = createArtifactRecovery(kind, doc, parse)
  let active = true, pending = false
  let acknowledgement: { nonce: string; id: string } | null = null
  const checkAcknowledgement = async () => {
    const current = acknowledgement
    const result = current && await recovery.settled()
    if (current && result?.saved && active && current === acknowledgement) {
      acknowledgement = null
      parent.postMessage({ type: 'artifact:recovery-saved', nonce: current.nonce, id: current.id, exact: result.exact }, '*')
    }
  }
  const confirm = () => { void recovery.confirm().catch(() => {});void checkAcknowledgement().catch(() => {}) }
  const unsubscribe = [doc.subscribeSave(confirm), doc.subscribeLoad?.(confirm)]
  confirm()
  const receive = async (event: MessageEvent) => {
    const data = event.data
    if (event.source !== parent || data?.type !== 'artifact:recovery-request' || data.kind !== kind
      || typeof data.nonce !== 'string' || data.nonce.length > 100 || typeof data.requestId !== 'string' || data.requestId.length > 100
      || !['snapshot', 'status', 'inspect', 'restore'].includes(data.command) || pending) return
    pending = true
    const reply = (result: string, bytes?: ArrayBuffer) => {
      if (active) parent.postMessage({ type: 'artifact:recovery-response', requestId: data.requestId, nonce: data.nonce, result, bytes }, '*', bytes ? [bytes] : [])
    }
    try {
      if (data.command === 'status') reply(recovery.status())
      else if (data.command === 'snapshot') {
        // Commit a focused native text edit to its document model before read.
        let current: Document | null = document
        for (let depth = 0; depth < 8 && current?.activeElement instanceof HTMLIFrameElement; depth++) {
          try { current = current.activeElement.contentDocument } catch { current = null }
        }
        if (current?.activeElement instanceof HTMLElement) current.activeElement.blur()
        await new Promise(resolve => setTimeout(resolve, 0))
        const snapshot = await recovery.snapshot();reply(snapshot.result, snapshot.bytes)
      } else {
        if (!(data.bytes instanceof ArrayBuffer)) throw Error('invalid recovery payload')
        if (data.command === 'restore') {
          if (data.bytes.byteLength > MAX_ARTIFACT_RECOVERY_BYTES) throw Error('oversized recovery payload')
          acknowledgement = { nonce: data.nonce, id: JSON.parse(new TextDecoder().decode(data.bytes)).id }
        }
        const result = data.command === 'inspect' ? await recovery.inspect(data.bytes) : await recovery.restore(data.bytes)
        reply(result)
        if (data.command === 'restore') { if (result === 'restored') acknowledgement = null;else void checkAcknowledgement().catch(() => {}) }
      }
    } catch { acknowledgement = null;reply('unavailable') }
    finally { pending = false }
  }
  window.addEventListener('message', receive)
  disconnect = () => { active = false;for (const stop of unsubscribe) stop?.();window.removeEventListener('message', receive) }
  window.addEventListener('pagehide', () => disconnect?.(), { once: true })
}

export const installDesignRecovery = (doc: NativeDocument, parse: (content: unknown) => unknown) => installArtifactRecovery('design', doc, parse)
