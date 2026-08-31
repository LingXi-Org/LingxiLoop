import { presentationStorageGc, presentationWorker } from './facade.js'

export const runPresentationWorkerOnce = presentationWorker.runOnce
export const startPresentationWorker = presentationWorker.start
export const runPresentationStorageGcOnce = presentationStorageGc.runOnce
export const startPresentationStorageGc = presentationStorageGc.start
