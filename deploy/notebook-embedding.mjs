export const notebookEmbeddingDefaults = Object.freeze({
  baseUrl: 'https://loop.lingxilearn.cn/internal/open-notebook/v1', model: 'Pro/BAAI/bge-m3', dimensions: 1024,
})
export const notebookEmbeddingBackendBaseUrl = 'https://backend.lingxilearn.cn/internal/open-notebook/v1'

export function notebookEmbeddingTarget(environment = process.env) {
  const origin = environment.LINGXILOOP_PUBLIC_ORIGIN?.trim().replace(/\/+$/, '')
  return { baseUrl: (environment.NOTEBOOK_EMBEDDING_BASE_URL?.trim()
      || (origin ? `${origin}/internal/open-notebook/v1` : notebookEmbeddingDefaults.baseUrl)).replace(/\/+$/, ''),
    model: environment.OPENAI_EMBEDDING_MODEL?.trim() || notebookEmbeddingDefaults.model, dimensions: notebookEmbeddingDefaults.dimensions }
}

/** No model aliases, endpoint relabelling or dimension-only compatibility claims.
 * A sealed shadow generation is verified by the existing startup coordinator. */
export function assertNotebookEmbeddingCompatible(observed, target) {
  if (!observed || observed.schemaVersion !== 1) throw new Error('Notebook schema observation is unavailable; no services were changed')
  if (target.baseUrl !== notebookEmbeddingBackendBaseUrl) {
    throw new Error('Notebook endpoint relocation is pending: the frontend /internal route remains denied; preserve the sealed generation and obtain a separately reviewed endpoint migration before deployment')
  }
  let effective = target
  if (observed.pointer) {
    const pointer = observed.pointer, marker = observed.generation
    if (pointer.phase !== 'active' || pointer.model !== target.model
      || ![target.baseUrl, `${target.baseUrl}/shadow`].includes(pointer.base_url)
      || !marker || !['verified', 'active'].includes(marker.phase)
      || !['plan_sha256', 'verification_sha256'].every(key => /^[a-f0-9]{64}$/.test(pointer[key]) && pointer[key] === marker[key])
      || !/^[a-f0-9]{64}$/.test(pointer.product_gate_sha256)) {
      throw new Error('Notebook generation is fenced or incompatible; inspect the retained migration receipts before deployment')
    }
    effective = { ...target, baseUrl: pointer.base_url }
  }
  const contract = observed.contract
  if (!contract && observed.chunks === 0) return
  if (!contract || contract.model !== effective.model || contract.model_id !== effective.model
    || contract.base_url !== effective.baseUrl || contract.dimensions !== effective.dimensions
    || observed.invalidDimensions !== 0) {
    throw new Error('Notebook embedding model/endpoint/index contract differs from the target; prepare and verify a separate generation, retaining the old index and source data')
  }
}
