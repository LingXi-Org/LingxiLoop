import { parentPort, workerData } from 'node:worker_threads'
import { tsImport } from 'tsx/esm/api'

try {
  const { convertLegacyArtifact } = await tsImport(new URL('../../../../shared/artifact-legacy.ts', import.meta.url).href, import.meta.url)
  parentPort.postMessage({ result: convertLegacyArtifact(workerData) })
} catch (error) {
  parentPort.postMessage({ error: error instanceof Error ? error.message : 'Legacy conversion failed' })
}
