import { z } from 'zod'

export const knowledgeSearchStatusSchema = z.enum(['not_run','running','matched','no_matches','no_sources','processing','failed','not_applicable','unknown'])
export type KnowledgeSearchStatus = z.infer<typeof knowledgeSearchStatusSchema>
export const knowledgeSearchLabels: Record<KnowledgeSearchStatus,string> = {
  not_run:'未调用课程检索工具',running:'正在检索课程资料',matched:'课程检索已命中',no_matches:'课程检索未命中',
  no_sources:'没有可检索的授权资料',processing:'课程资料仍在处理',failed:'课程检索未完成',not_applicable:'当前会话不适用课程检索',unknown:'课程检索结果未知',
}
/** Native knowledge.search receipts only. Embeddings, loaded context and prose
 * are neither search calls nor proof of search success. */
export function knowledgeSearchStatus(tools: readonly { toolName: string; result?: unknown; isError?: boolean }[], stopped = false): KnowledgeSearchStatus {
  const search=tools.filter(tool=>['knowledge.search','knowledge__search'].includes(tool.toolName)).at(-1)
  if (!search) return 'not_run'
  if (search.isError) return 'failed'
  if (search.result === undefined) return stopped ? 'failed' : 'running'
  const result=search.result && typeof search.result==='object' ? search.result as Record<string,unknown> : {}
  if(search.isError || ['failed','cancelled'].includes(String(result.status)))return 'failed'
  if(result.status!=='completed')return 'unknown'
  if(result.sourceStatus==='unavailable')return 'failed'
  return ['matched','no_matches','no_sources','processing','not_applicable'].includes(String(result.sourceStatus))
    ? result.sourceStatus as KnowledgeSearchStatus : 'unknown'
}
