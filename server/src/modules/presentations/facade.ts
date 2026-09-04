import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { env } from '../../env.js'
import { sendAgentChannelMessage } from '../../im/public.js'
import { createChatCompletion } from '../../llm.js'
import { storage } from '../../storage.js'
import { openNotebookClient } from '../knowledge/public.js'
import { PresentationsApplication, createPresentationAgentFacade } from './application.js'
import type { PresentationJsonModel, PresentationMaterialV1 } from './generation.js'
import type { AuthorizedPresentationSource } from './repository.js'
import { createPresentationStorageGc } from './storage-gc.js'
import { createPresentationWorker } from './worker.js'

function parseJsonContent(value: string): unknown {
  const trimmed = value.trim()
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)
  return JSON.parse(fenced?.[1] ?? trimmed)
}

const model: PresentationJsonModel = {
  async complete(input) {
    const response = await createChatCompletion({
      purpose: input.purpose,
      companyId: input.companyId,
      conversationId: input.conversationId,
      source: 'product',
      extras: {
        presentationId: input.presentationId,
        jobId: input.jobId,
        ...(input.pageId ? { pageId: input.pageId } : {}),
      },
    }, {
      model: env.OPENAI_MODEL,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
      ],
      response_format: { type: 'json_object' },
    })
    const content = response.choices[0]?.message.content
    if (!content) throw new Error('presentation model returned no JSON content')
    return parseJsonContent(content)
  },
}

interface UpstreamPresentationMaterial {
  version: 'PresentationMaterialV1'
  source_id: string
  title: string
  blocks: Array<{
    chunk_id: string; ordinal: number; text: string
    page_number?: number | null; section_title?: string | null
  }>
  assets?: Array<{
    asset_id: string; mime_type: PresentationMaterialV1['assets'][number]['mimeType']; data_uri: string
    page_number?: number | null; section_title?: string | null; width?: number | null; height?: number | null
  }>
  truncated: boolean
}

async function loadMaterial(source: AuthorizedPresentationSource): Promise<PresentationMaterialV1> {
  if (source.status !== 'ready' || !source.externalSourceId) throw new Error('presentation source is not ready')
  const provider = openNotebookClient as typeof openNotebookClient & {
    getPresentationMaterial?(sourceId: string): Promise<UpstreamPresentationMaterial>
  }
  if (typeof provider.getPresentationMaterial !== 'function') {
    throw new Error('Open Notebook presentation-material contract is unavailable')
  }
  const material = await provider.getPresentationMaterial(source.externalSourceId)
  if (material.version !== 'PresentationMaterialV1' || material.source_id !== source.externalSourceId) {
    throw new Error('Open Notebook returned material for a different source')
  }
  const blocks = material.blocks.slice(0, 200).map((block) => ({
    chunkId: String(block.chunk_id).slice(0, 240),
    ordinal: Math.max(0, Math.floor(Number(block.ordinal))),
    text: String(block.text).trim().slice(0, 4_000),
    pageNumber: Number.isInteger(block.page_number) && Number(block.page_number) > 0 ? Number(block.page_number) : null,
    sectionTitle: typeof block.section_title === 'string' ? block.section_title.slice(0, 200) : null,
  })).filter((block) => block.chunkId && block.text)
  const assets = (material.assets ?? []).slice(0, 40).flatMap((asset) => {
    const dataUri = String(asset.data_uri)
    if (!dataUri.startsWith(`data:${asset.mime_type};base64,`) || Buffer.byteLength(dataUri) > 4 * 1024 * 1024) return []
    return [{
      assetId: String(asset.asset_id).slice(0, 240),
      mimeType: asset.mime_type,
      dataUri,
      pageNumber: Number.isInteger(asset.page_number) && Number(asset.page_number) > 0 ? Number(asset.page_number) : null,
      sectionTitle: typeof asset.section_title === 'string' ? asset.section_title.slice(0, 200) : null,
      width: Number.isFinite(asset.width) && Number(asset.width) > 0 ? Number(asset.width) : null,
      height: Number.isFinite(asset.height) && Number(asset.height) > 0 ? Number(asset.height) : null,
    }]
  })
  return {
    schemaVersion: 'presentation_material_v1',
    sourceId: source.sourceId,
    title: source.title,
    blocks,
    assets,
    truncated: material.truncated === true,
  }
}

export const presentationsApplication = new PresentationsApplication({
  db: pool,
  transaction: (work) => withTransaction(pool, work),
  storage,
  enabled: () => env.PRESENTATION_HTML_ENABLED,
  sendArtifactCard: async (input) => {
    const sent = await sendAgentChannelMessage({
      companyId: input.companyId,
      agentId: input.agentId,
      channelId: input.channelId,
      clientNonce: input.clientMsgNo,
      payload: {
        version: 1,
        kind: 'artifact',
        clientMsgNo: input.clientMsgNo,
        body: input.title,
        refs: { presentationId: input.presentationId, agentId: input.agentId },
        data: {
          artifactId: input.presentationId,
          artifactKind: 'lecture_deck_html',
          title: input.title,
        },
      },
    })
    if (sent.kind !== 'accepted') throw new Error(`presentation Artifact card send failed: ${sent.kind}`)
  },
})

export const presentationAgentFacade = createPresentationAgentFacade(presentationsApplication)

export const presentationWorker = createPresentationWorker({
  db: pool,
  transaction: (work) => withTransaction(pool, work),
  storage,
  model,
  enabled: () => env.PRESENTATION_HTML_ENABLED,
  loadMaterial,
})

export const presentationStorageGc = createPresentationStorageGc({ db: pool, storage })
