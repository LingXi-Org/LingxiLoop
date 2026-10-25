import { queueCaseCover, cancelUnneededCaseCovers, listCaseCoverDescriptors } from './cover-repository.js'
import type { CoverSnapshotKind } from './cover-contracts.js'
import { documentFileUrls } from '../content-editor/contracts.js'
import { randomUUID } from 'node:crypto'
import { fromMarkdown } from 'mdast-util-from-markdown'
import type { Queryable } from '../../db/queryable.js'
import { HttpError } from '../../http/errors.js'
import { createPermissionService } from '../access/public.js'
import type { CaseContent, CaseScope, CaseView } from './contracts.js'

export interface CasesInfrastructure {
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  putObject(key: string, body: Buffer, contentType: string): Promise<void>
}
interface CaseRow {
  created_by: string; author_name: string; author_avatar_url: string | null
  id: string; company_id: string; draft: CaseContent; published: CaseContent | null
  status: 'draft' | 'published' | 'unpublished'; version: number; published_version: number | null
  source_id: string | null; created_at: string; updated_at: string; published_at: string | null
  index_status: string | null; index_error: string | null
}
export function caseImageUrl(key: string) { return `/api/files?key=${encodeURIComponent(key)}` }
function references(content: CaseContent, url: string) { return contentImageUrls(content).includes(url) }
async function access(db: Queryable, scope: CaseScope, manage = false, lock = false) {
  return createPermissionService(db, { lockDependencies: lock }).assertCan({
    actorUserId: scope.userId, companyId: scope.companyId, action: manage ? 'cases:manage' : 'cases:read',
  })
}
async function accessView(db: Queryable, scope: CaseScope, view: CaseView) {
  await access(db,scope,view==='manage')
  return view==='manage' || (await createPermissionService(db).can({
    actorUserId:scope.userId,companyId:scope.companyId,action:'cases:manage',
  })).allowed
}
async function row(db: Queryable, scope: CaseScope, id: string, lock = false): Promise<CaseRow> {
  const { rows } = await db.query<CaseRow>(`SELECT c.*,u.display_name AS author_name,u.avatar_url AS author_avatar_url,s.status AS index_status,s.error AS index_error
    FROM organization_cases c LEFT JOIN knowledge_sources s ON s.id=c.source_id AND s.deleted_at IS NULL
    JOIN users u ON u.id=c.created_by
    WHERE c.id=$1 AND c.company_id=$2 AND c.deleted_at IS NULL ${lock ? 'FOR UPDATE OF c' : ''}`, [id,scope.companyId])
  if (!rows[0]) throw new HttpError(404, 'case not found')
  return rows[0]
}
function payload(c: CaseRow, view: CaseView, canManage: boolean) {
  const manage = view==='manage'
  if (!manage && (c.status !== 'published' || !c.published)) throw new HttpError(404, 'case not found')
  return { ...(manage ? c.draft : c.published!), id: c.id, companyId: c.company_id, view,
    authorId: c.created_by, authorName: c.author_name, authorAvatarUrl: c.author_avatar_url,
    status: c.status, version: manage ? c.version : c.published_version!, publishedVersion: c.published_version,
    indexStatus: c.index_status, indexError: manage ? c.index_error : null,
    hasUnpublishedChanges: manage && JSON.stringify(c.draft) !== JSON.stringify(c.published),
    canManage, createdAt: c.created_at, updatedAt: manage ? c.updated_at : c.published_at!, publishedAt: c.published_at }
}
function checkVersion(c: CaseRow, version: number) {
  if (c.version !== version) throw new HttpError(409, '案例已被其他教师更新，请刷新后重试')
}
type MarkdownNode = ReturnType<typeof fromMarkdown> | ReturnType<typeof fromMarkdown>['children'][number]
function visitMarkdown(tree: MarkdownNode, visitor: (node: MarkdownNode) => void): void {
  const pending = [tree]
  while (pending.length) {
    const node = pending.pop()!
    visitor(node)
    // Reverse the push order to preserve Markdown's first-definition-wins behavior.
    if ('children' in node) {
      for (let i = node.children.length - 1; i >= 0; i--) pending.push(node.children[i]!)
    }
  }
}
function contentImageUrls(content: CaseContent): string[] {
  // Parse exactly the Markdown image forms supported by the reader, including definitions.
  const tree = fromMarkdown(`${content.body}\n\n${content.summary}`)
  const definitions = new Map<string,string>()
  visitMarkdown(tree, node => {
    if (node.type === 'definition' && !definitions.has(node.identifier)) definitions.set(node.identifier, node.url)
  })
  const urls: string[] = [...documentFileUrls(content.editorDocument), ...documentFileUrls(content.summaryDocument)]
  visitMarkdown(tree, node => {
    if (node.type === 'image' || node.type === 'link' && node.url.startsWith('/api/files?')) urls.push(node.url)
    if (node.type === 'imageReference') {
      const url = definitions.get(node.identifier)
      if (url) urls.push(url)
    }
  })
  if (content.cover) urls.push(content.cover)
  return urls
}
async function validateImages(db: Queryable, scope: CaseScope, id: string, content: CaseContent) {
  const urls = contentImageUrls(content)
  for (const url of urls) {
    let key: string | null = null
    try { const parsed = new URL(url, 'https://cases.invalid'); if (parsed.origin === 'https://cases.invalid' && parsed.pathname === '/api/files') key = parsed.searchParams.get('key') } catch { /* invalid URL */ }
    if (!key || url !== caseImageUrl(key)) throw new HttpError(400, '案例图片必须使用本案例上传的图片')
    const { rows } = await db.query(`SELECT 1 FROM organization_case_images WHERE storage_key=$1 AND case_id=$2 AND company_id=$3`, [key,id,scope.companyId])
    if (!rows.length) throw new HttpError(400, '案例图片不属于本案例')
  }
}
async function invalidate(db: Queryable, sourceId: string | null) {
  if (!sourceId) return
  // Match the ingestion worker's lock order: job first, then source.
  await db.query(
    `UPDATE knowledge_source_jobs
        SET status='failed',leased_by=NULL,leased_until=NULL,
            last_error='case version superseded',updated_at=NOW()
      WHERE source_id=$1`,
    [sourceId],
  )
  await db.query(
    `UPDATE knowledge_sources SET deleted_at=NOW(),updated_at=NOW() WHERE id=$1`,
    [sourceId],
  )
}
export class CasesApplication {
  constructor(private readonly db: Queryable, private readonly infrastructure: CasesInfrastructure) {}
  async list(scope: CaseScope, query = '', category = '', view: CaseView = 'reader') {
    const canManage = await accessView(this.db,scope,view)
    const manage = view==='manage'
    const { rows } = await this.db.query<CaseRow>(`SELECT c.*,u.display_name AS author_name,u.avatar_url AS author_avatar_url,s.status AS index_status,s.error AS index_error
      FROM organization_cases c LEFT JOIN knowledge_sources s ON s.id=c.source_id AND s.deleted_at IS NULL
      JOIN users u ON u.id=c.created_by
      WHERE c.company_id=$1 AND c.deleted_at IS NULL AND ($2 OR c.status='published')
      ORDER BY CASE WHEN $2 THEN c.updated_at ELSE c.published_at END DESC`, [scope.companyId,manage])
    const covers = await listCaseCoverDescriptors(this.db,scope.companyId,rows.map(c => c.id),manage?'draft':'published',manage)
    const all = rows.map(c => ({ ...payload(c,view,canManage), generatedCover:covers.get(c.id) ?? null }))
    const q = query.trim().toLocaleLowerCase()
    return { items: all.filter(c => (!category || c.category === category) && (!q || [c.title,c.summary,c.body,c.category,...c.tags].join(' ').toLocaleLowerCase().includes(q))),
      categories: [...new Set(all.map(c => c.category).filter(Boolean))].sort(), canManage, view }
  }
  async detail(scope: CaseScope, id: string, view: CaseView = 'reader') {
    const canManage = await accessView(this.db,scope,view)
    const manage = view==='manage'
    const c = payload(await row(this.db,scope,id),view,canManage)
    const covers = await listCaseCoverDescriptors(this.db,scope.companyId,[id],manage?'draft':'published',manage)
    return { ...c,generatedCover:covers.get(id) ?? null }
  }
  async create(scope: CaseScope, content: CaseContent) {
    const id = `case-${randomUUID()}`
    await this.infrastructure.transaction(async db => {
      await access(db,scope,true,true)
      await validateImages(db,scope,id,content)
      await db.query(`INSERT INTO organization_cases(id,company_id,created_by,draft) VALUES($1,$2,$3,$4::jsonb)`, [id,scope.companyId,scope.userId,JSON.stringify(content)])
      await queueCaseCover(db,scope,id,'draft',content)
    })
    return this.detail(scope,id,'manage')
  }
  async save(scope: CaseScope, id: string, content: CaseContent, version: number) {
    await this.infrastructure.transaction(async db => {
      await access(db,scope,true,true)
      const c = await row(db,scope,id,true); checkVersion(c,version)
      await validateImages(db,scope,id,content)
      await db.query(`UPDATE organization_cases SET draft=$2::jsonb,version=version+1,updated_at=NOW() WHERE id=$1`, [id,JSON.stringify(content)])
      await queueCaseCover(db,scope,id,'draft',content)
      await cancelUnneededCaseCovers(db,scope.companyId,id)
    })
    return this.detail(scope,id,'manage')
  }
  async publish(scope: CaseScope, id: string, version: number) {
    await this.infrastructure.transaction(async db => {
      await access(db,scope,true,true)
      const c = await row(db,scope,id,true); checkVersion(c,version)
      if (!c.draft.body.trim()) throw new HttpError(400,'案例正文不能为空')
      await validateImages(db,scope,id,c.draft)
      const sourceId = `ks-case-${randomUUID()}`
      const nextVersion = c.version+1
      const text = [c.draft.title,c.draft.summary,c.draft.category,c.draft.tags.join(', '),c.draft.body].join('\n\n')
      const key = `knowledge-sources/${scope.companyId}/cases/${sourceId}.txt`
      await this.infrastructure.putObject(key,Buffer.from(text,'utf8'),'text/plain')
      await invalidate(db,c.source_id)
      await db.query(`INSERT INTO knowledge_sources(id,company_id,case_id,case_version,kind,title,mime_type,size_bytes,storage_key,original_url,visibility_scope,owner_user_id,created_by_user_id,created_via)
        VALUES($1,$2,$3,$4,'text',$5,'text/plain',$6,$7,$8,'COMPANY_CASE',$9,$9,'USER')`,
        [sourceId,scope.companyId,id,nextVersion,c.draft.title,Buffer.byteLength(text),key,`/cases/${encodeURIComponent(id)}?company=${encodeURIComponent(scope.companyId)}`,scope.userId])
      await db.query(`INSERT INTO knowledge_source_jobs(id,source_id) VALUES($1,$2)`, [`ksj-${randomUUID()}`,sourceId])
      await db.query(`UPDATE organization_cases SET published=draft,status='published',published_version=$2,version=$2,source_id=$3,published_at=NOW(),updated_at=NOW() WHERE id=$1`, [id,nextVersion,sourceId])
      await queueCaseCover(db,scope,id,'draft',c.draft)
      await queueCaseCover(db,scope,id,'published',c.draft)
      await cancelUnneededCaseCovers(db,scope.companyId,id)
    })
    return this.detail(scope,id,'manage')
  }
  async unpublish(scope: CaseScope, id: string, version: number) {
    await this.infrastructure.transaction(async db => {
      await access(db,scope,true,true)
      const c = await row(db,scope,id,true); checkVersion(c,version)
      await invalidate(db,c.source_id)
      await db.query(`UPDATE organization_cases SET status='unpublished',source_id=NULL,version=version+1,updated_at=NOW() WHERE id=$1`, [id])
      await cancelUnneededCaseCovers(db,scope.companyId,id,true)
    })
    return this.detail(scope,id,'manage')
  }
  async remove(scope: CaseScope, id: string, version: number) {
    await this.infrastructure.transaction(async db => {
      await access(db,scope,true,true)
      const c = await row(db,scope,id,true); checkVersion(c,version)
      await invalidate(db,c.source_id)
      await db.query(`UPDATE organization_cases SET deleted_at=NOW(),version=version+1,updated_at=NOW() WHERE id=$1`, [id])
      await cancelUnneededCaseCovers(db,scope.companyId,id,true)
    })
    return { deleted:true as const,id }
  }
  async retry(scope: CaseScope, id: string, version: number) {
    await this.infrastructure.transaction(async db => {
      await access(db,scope,true,true)
      const c = await row(db,scope,id,true); checkVersion(c,version)
      if (c.status !== 'published' || !c.source_id) throw new HttpError(409,'只有已发布案例可以重新索引')
      // Match completion, requeue and failure handling in the ingestion worker.
      await db.query(
        `UPDATE knowledge_source_jobs
            SET status='queued',attempts=0,available_at=NOW(),leased_by=NULL,leased_until=NULL,last_error=NULL
          WHERE source_id=$1`,
        [c.source_id],
      )
      await db.query(
        `UPDATE knowledge_sources
            SET status='queued',stage=CASE WHEN external_source_id IS NULL THEN 'queued' ELSE 'retrying' END,error=NULL
          WHERE id=$1 AND deleted_at IS NULL`,
        [c.source_id],
      )
    })
    return this.detail(scope,id,'manage')
  }
  async retryCover(scope: CaseScope, id: string, kind: CoverSnapshotKind, fingerprint: string, expectedGeneration: number, idempotencyKey = `${fingerprint}:${expectedGeneration}`) {
    await this.infrastructure.transaction(async db => {
      await access(db,scope,true,true)
      const c = await row(db,scope,id,true)
      if (kind==='published' && c.status!=='published') throw new HttpError(404,'case not found')
      const { rows } = await db.query<{ id:string; fingerprint:string; generation:number; retry_key:string|null; retry_expected_generation:number|null }>(`
        SELECT j.* FROM organization_case_cover_targets t JOIN organization_case_cover_jobs j ON j.id=t.job_id
        WHERE t.case_id=$1 AND t.company_id=$2 AND t.snapshot_kind=$3 FOR UPDATE OF j`, [id,scope.companyId,kind])
      const job = rows[0]
      if (!job || job.fingerprint!==fingerprint) throw new HttpError(409,'封面内容已更新，请刷新后重试')
      if (job.retry_key===idempotencyKey) {
        if (job.retry_expected_generation===expectedGeneration && job.generation===expectedGeneration+1) return
        throw new HttpError(409,'封面重试请求已过期，请刷新后重试')
      }
      if (job.generation!==expectedGeneration) throw new HttpError(409,'封面已更新，请刷新后重试')
      await db.query(`UPDATE organization_case_cover_jobs SET generation=generation+1,status='pending',attempts=0,
        available_at=NOW(),lease_token=NULL,leased_until=NULL,failure_category=NULL,requested_by=$2,retry_key=$3,
        retry_expected_generation=$4,updated_at=NOW() WHERE id=$1`, [job.id,scope.userId,idempotencyKey,expectedGeneration])
    })
    return this.detail(scope,id,'manage')
  }
  async backfillCovers(scope: CaseScope, afterId = '', limit = 25) {
    const boundedLimit = Math.max(1,Math.min(50,Math.trunc(limit)||25))
    return this.infrastructure.transaction(async db => {
      await access(db,scope,true,true)
      const { rows } = await db.query<CaseRow>(`SELECT * FROM organization_cases WHERE company_id=$1 AND deleted_at IS NULL AND id>$2 ORDER BY id LIMIT $3 FOR UPDATE`, [scope.companyId,afterId,boundedLimit])
      for (const c of rows) {
        await queueCaseCover(db,scope,c.id,'draft',c.draft)
        if (c.status==='published' && c.published) await queueCaseCover(db,scope,c.id,'published',c.published)
        await cancelUnneededCaseCovers(db,scope.companyId,c.id)
      }
      const counts = await db.query<{ pending:string; succeeded:string; failed:string; cancelled:string }>(`
        SELECT COUNT(*) FILTER(WHERE status IN ('pending','generating'))::text AS pending,
          COUNT(*) FILTER(WHERE status='ready')::text AS succeeded, COUNT(*) FILTER(WHERE status='failed')::text AS failed,
          COUNT(*) FILTER(WHERE status='cancelled')::text AS cancelled FROM organization_case_cover_jobs WHERE company_id=$1`, [scope.companyId])
      const count = counts.rows[0]!
      return { scanned:rows.length,nextAfterId:rows.length===boundedLimit?rows.at(-1)!.id:null,
        pending:Number(count.pending),succeeded:Number(count.succeeded),failed:Number(count.failed),cancelled:Number(count.cancelled) }
    })
  }
  async coverAsset(scope: CaseScope, id: string, jobId: string, generation: number, assetKind: 'preview'|'interactive', snapshot: CoverSnapshotKind) {
    // Hold membership and case locks through the bounded read so revocation,
    // unpublish and publication cannot race the asset authorization decision.
    return this.infrastructure.transaction(async db => {
      await access(db,scope,false,true)
      if (snapshot==='draft' && !(await createPermissionService(db,{lockDependencies:true}).can({
        actorUserId:scope.userId,companyId:scope.companyId,action:'cases:manage',
      })).allowed) throw new HttpError(404,'cover not found')
      const c = await row(db,scope,id,true)
      if (snapshot==='published' && (c.status!=='published' || !c.published)) throw new HttpError(404,'cover not found')
      const { rows } = await db.query<{ preview_svg:string; interactive_html:string }>(`
        SELECT a.preview_svg,a.interactive_html FROM organization_case_cover_targets t
        JOIN organization_case_cover_assets a ON a.job_id=t.asset_job_id AND a.generation=t.asset_generation
          AND a.case_id=t.case_id AND a.company_id=t.company_id
        WHERE t.case_id=$1 AND t.company_id=$2 AND t.snapshot_kind=$3 AND a.job_id=$4 AND a.generation=$5`, [id,scope.companyId,snapshot,jobId,generation])
      if (!rows[0]) throw new HttpError(404,'cover not found')
      return assetKind==='preview'?rows[0].preview_svg:rows[0].interactive_html
    })
  }
  async coverAssetScope(userId: string, id: string): Promise<CaseScope> {
    const { rows } = await this.db.query<{ company_id:string }>('SELECT company_id FROM organization_cases WHERE id=$1 AND deleted_at IS NULL',[id])
    if (!rows[0]) throw new HttpError(404,'cover not found')
    return { userId,companyId:rows[0].company_id }
  }
  async uploadImage(scope: CaseScope, id: string, mime: string, data: string) {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data)) throw new HttpError(400,'invalid image data')
    const bytes = Buffer.from(data,'base64')
    if (!bytes.length || bytes.length>8*1024*1024) throw new HttpError(400,'图片最大为 8 MB')
    const valid = mime==='image/png' ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : mime==='image/jpeg' ? bytes[0]===255 && bytes[1]===216 && bytes[2]===255
      : mime==='image/gif' ? /^GIF8[79]a/.test(bytes.subarray(0,6).toString())
      : mime==='image/webp' && bytes.subarray(0,4).toString()==='RIFF' && bytes.subarray(8,12).toString()==='WEBP'
    if (!valid) throw new HttpError(400,'图片格式与内容不符')
    return this.storeAsset(scope,id,mime,bytes)
  }
  async uploadFile(scope: CaseScope, id: string, mime: string, data: string) {
    if (mime.startsWith('image/')) return this.uploadImage(scope,id,mime,data)
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data)) throw new HttpError(400,'invalid file data')
    const bytes = Buffer.from(data,'base64')
    if (!bytes.length || bytes.length>8*1024*1024) throw new HttpError(400,'附件最大为 8 MB')
    return this.storeAsset(scope,id,mime,bytes)
  }
  private async storeAsset(scope: CaseScope, id: string, mime: string, bytes: Buffer) {
    // Keep the existing namespace/table so authorization and old readers cannot fall through.
    const key = `case-images/${scope.companyId}/${id}/${randomUUID()}`
    await this.infrastructure.transaction(async db => {
      await access(db,scope,true,true); await row(db,scope,id,true)
      await this.infrastructure.putObject(key,bytes,mime)
      await db.query(`INSERT INTO organization_case_images(storage_key,case_id,company_id,created_by) VALUES($1,$2,$3,$4)`, [key,id,scope.companyId,scope.userId])
    })
    return { key,url:caseImageUrl(key) }
  }
}

/** null means not a case asset; false must never fall through to generic file grants. */
export async function canReadCaseFile(db: Queryable, key: string, userId: string): Promise<boolean | null> {
  if (!key.startsWith('case-images/')) return null
  const { rows } = await db.query<CaseRow>(`SELECT c.* FROM organization_case_images i JOIN organization_cases c ON c.id=i.case_id AND c.company_id=i.company_id WHERE i.storage_key=$1 AND c.deleted_at IS NULL`, [key])
  const c = rows[0]
  if (!c) return false
  const permissions = createPermissionService(db)
  const decision = await permissions.can({ actorUserId:userId,companyId:c.company_id,action:'cases:read' })
  if (!decision.allowed) return false
  if (c.status==='published' && c.published && references(c.published,caseImageUrl(key))) return true
  return (await permissions.can({ actorUserId:userId,companyId:c.company_id,action:'cases:manage' })).allowed
}
