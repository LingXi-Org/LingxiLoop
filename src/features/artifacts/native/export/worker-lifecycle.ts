const workers = new Set<Worker>()
export function trackExportWorker(worker: Worker): Worker { workers.add(worker); return worker }
export function releaseExportWorker(worker: Worker) { workers.delete(worker); worker.terminate() }
export function releaseAllExportWorkers() { for (const worker of workers) worker.terminate(); workers.clear() }
