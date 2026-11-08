import type { Bounds, ComputeMessage, ComputeResponse, ComputeTask, ComputeValue, ElementGeometry, ElementProjection, MathResult, Point, Rect, ThemeResult, ThemeTokens } from './compute-protocol'
import type {PenGeometry} from '../../../../shared/artifact-pen'
export type { Bounds, BoundsIssue, MathResult, Point, Rect, ThemeResult, ThemeTokens } from './compute-protocol'

interface Pending {
  revision: number
  resolve(value: ComputeValue): void
  reject(reason: Error): void
  cleanup(): void
}
const aborted = () => new DOMException('Computation cancelled', 'AbortError')

/** One lazily created worker per open editor. Call dispose when its document closes. */
export class NativeCompute {
  private worker: Worker | undefined
  private pending = new Map<number, Pending>()
  private nextId = 0
  private revision = -1
  private disposed = false

  private ensureWorker() {
    if (this.disposed) throw aborted()
    if (!this.worker) {
      const worker = new Worker(new URL('./compute.worker.ts', import.meta.url), { type: 'module', name: 'artifact-compute' })
      worker.onmessage = (event: MessageEvent<ComputeResponse>) => {
        const { id, revision, value, error } = event.data
        const pending = this.pending.get(id)
        if (!pending) return
        this.pending.delete(id)
        pending.cleanup()
        if (revision !== pending.revision || revision !== this.revision) pending.reject(aborted())
        else if (error) pending.reject(new Error(error))
        else pending.resolve(value ?? null)
      }
      worker.onerror = () => {
        this.disposed = true
        this.rejectAll(new Error('编辑计算暂时不可用，请重新打开文稿。'))
        worker.terminate()
        this.worker = undefined
      }
      this.worker = worker
    }
    return this.worker
  }

  private rejectAll(reason: Error) {
    for (const [id, pending] of this.pending) {
      this.worker?.postMessage({ cancel: id } satisfies ComputeMessage)
      pending.cleanup()
      pending.reject(reason)
    }
    this.pending.clear()
  }

  private request<T extends ComputeValue>(task: ComputeTask, revision: number, signal?: AbortSignal, transfer:Transferable[]=[]): Promise<T> {
    if (signal?.aborted || this.disposed || revision < this.revision) return Promise.reject(aborted())
    if (revision > this.revision) { this.revision = revision; this.rejectAll(aborted()) }
    let worker: Worker
    try { worker = this.ensureWorker() }
    catch (reason) { return Promise.reject(reason) }
    const id = ++this.nextId
    return new Promise<T>((resolve, reject) => {
      const cancel = () => {
        const pending = this.pending.get(id)
        if (!pending) return
        this.pending.delete(id)
        pending.cleanup()
        worker.postMessage({ cancel: id } satisfies ComputeMessage)
        reject(aborted())
      }
      this.pending.set(id, { revision, resolve: value => resolve(value as T), reject,
        cleanup: () => signal?.removeEventListener('abort', cancel) })
      signal?.addEventListener('abort', cancel, { once: true })
      try { worker.postMessage({ id, revision, task } satisfies ComputeMessage,transfer) }
      catch (reason) {
        this.pending.delete(id)
        signal?.removeEventListener('abort', cancel)
        reject(reason)
      }
    })
  }

  async setPages(pages: Bounds[], revision: number) { await this.request<null>({ kind: 'pages', pages }, revision) }
  async updatePages(upserts: Bounds[], removed: string[], revision: number) {
    await this.request<null>({ kind: 'update-pages', upserts, removed }, revision)
  }
  visible(viewport: Rect, revision: number, signal?: AbortSignal) {
    return this.request<string[]>({ kind: 'visible', viewport }, revision, signal)
  }
  snap(point: Point, tolerance: number, revision: number, signal?: AbortSignal) {
    return this.request<Point>({ kind: 'snap', point, tolerance }, revision, signal)
  }
  projectElements(pageId:string,geometry:ElementGeometry,viewport:Rect,geometryKey:number,revision:number,signal?:AbortSignal){
    // Transfer an owned copy; the viewport cache must retain its reusable coordinates.
    const coordinates=geometry.coordinates.slice()
    return this.request<ElementProjection>({kind:'project-elements',pageId,geometry:{ids:geometry.ids,coordinates},viewport,geometryKey},revision,signal,[coordinates.buffer])
  }
  async dropElements(pageId: string, revision: number) {
    await this.request<null>({ kind: 'drop-elements', pageId }, revision)
  }
  resolveTheme(tokens: ThemeTokens, revision: number, signal?: AbortSignal) {
    return this.request<ThemeResult>({ kind: 'resolve-theme', tokens }, revision, signal)
  }
  math(source: string, display: boolean, revision: number, signal?: AbortSignal) {
    return this.request<MathResult>({ kind: 'math', source, display }, revision, signal)
  }
  pen(points:Point[],tolerance:number,revision:number,signal?:AbortSignal){
    return this.request<PenGeometry|null>({kind:'pen',points,tolerance},revision,signal)
  }
  dispose() { this.disposed = true; this.rejectAll(aborted()); this.worker?.terminate(); this.worker = undefined }
}
