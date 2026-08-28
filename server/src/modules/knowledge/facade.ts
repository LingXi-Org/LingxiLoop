import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import {
  deleteKnowledgeSource,
  ensureProjectNotebook,
  getKnowledgeSourceText,
  MAX_SOURCE_BYTES,
  openNotebookEnabled,
  retryKnowledgeSource,
  syncProjectNotebookMetadata,
} from './runtime.js'
import { storage } from '../../storage.js'
import { KnowledgeApplication } from './application.js'

export const knowledgeApplication = new KnowledgeApplication(pool, {
  transaction: (work) => withTransaction(pool, work),
  notebookEnabled: openNotebookEnabled,
  ensureNotebook: async (projectId, companyId) => { await ensureProjectNotebook(projectId, companyId) },
  syncNotebookMetadata: syncProjectNotebookMetadata,
  sourceText: getKnowledgeSourceText,
  retrySource: retryKnowledgeSource,
  deleteSource: deleteKnowledgeSource,
  putObject: async (key, body, contentType) => { await storage.put(key, body, contentType) },
  presignPut: (key, contentType) => storage.presignPut(key, contentType),
  readObject: (key) => storage.readObject(key),
  publicUrl: (key) => storage.publicUrl(key),
  maxSourceBytes: MAX_SOURCE_BYTES,
})
