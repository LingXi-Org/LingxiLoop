import { createHash, randomUUID } from 'node:crypto'
import { pool } from '../../db/pool.js'
import type { CliResult, CliSideEffect } from '../cli-result.js'
import { resolveAs } from '../cli-identity.js'
import { type ParsedArgs, unescapeChat } from '../cli-parse.js'
import { consumeHold, recordHold } from '../seen-boundary.js'
import { normalizeWorkSubject, type WorkTaskType } from '../work-claims.js'

interface RunCliInternalContext {
  idempotencyKey?: string
  projectId?: string
  deferReadCursor?: boolean
}

interface DocumentCommandDependencies {
  ok(text: string, sideEffects?: CliSideEffect[]): CliResult
  err(text: string, code?: number): CliResult
  agentCompany(agentId: string): Promise<string | null>
  resolveCliProjectId(companyId: string, requested?: string): Promise<string>
  tryClaimTenantWork(companyId: string, agentId: string, taskType: WorkTaskType, subject: string): Promise<CliResult | null>
  releaseTenantWork(companyId: string, agentId: string, taskType: WorkTaskType, subject: string): Promise<void>
  cmdReply(parsed: ParsedArgs, internal?: RunCliInternalContext): Promise<CliResult>
}

export function createDocumentCommand(dependencies: DocumentCommandDependencies) {
  const { ok, err, agentCompany, resolveCliProjectId, tryClaimTenantWork, releaseTenantWork, cmdReply } = dependencies
  async function publishDocChanged(
    companyId: string,
    documentId: string,
    kind: 'document.created' | 'document.updated' | 'document.deleted',
    actorId: string,
    requestedWorkspaceId?: string,
  ): Promise<void> {
    const workspaceId = requestedWorkspaceId ?? (await pool.query<{ project_id: string }>(
      `SELECT project_id FROM documents WHERE id=$1 AND company_id=$2 LIMIT 1`,
      [documentId, companyId],
    )).rows[0]?.project_id
    const { CH_DOCS, publish } = await import('../../redis.js')
    await publish(CH_DOCS, {
      type: 'doc.changed',
      kind,
      companyId,
      workspaceId,
      documentId,
      actorId,
    })
  }
  
  async function cmdDoc(parsed: ParsedArgs, internal: RunCliInternalContext = {}): Promise<CliResult> {
    const op = parsed.positional[0] ?? 'ls'
    const me = resolveAs(parsed)
    const companyId = await agentCompany(me)
    if (!companyId) return err(`unknown agent ${me} (no company)`)
    const projectId = await resolveCliProjectId(companyId, internal.projectId)
  
    if (!['ls', 'list', 'create', 'new'].includes(op)) {
      const documentId = parsed.positional[1]
      if (documentId) {
        const access = await pool.query(
          `SELECT 1 FROM documents WHERE id=$1 AND company_id=$2 AND project_id=$3 LIMIT 1`,
          [documentId, companyId, projectId],
        )
        if (!access.rows[0]) return err(`document ${documentId} not found`)
      }
    }
  
    if (op === 'ls' || op === 'list') {
      const { rows } = await pool.query<{
        id: string; title: string; created_by: string; updated_at: Date
      }>(
        `SELECT id, title, created_by, updated_at FROM documents
          WHERE company_id = $1 AND project_id = $2 ORDER BY updated_at DESC LIMIT 200`,
        [companyId, projectId],
      )
      if (parsed.flags.json) return ok(JSON.stringify(rows, null, 2))
      if (rows.length === 0) return ok('(no documents in this workspace)')
      return ok([
        `${rows.length} document(s):`,
        '',
        ...rows.map((d) => `  ${d.id.padEnd(24)} ${d.title}`),
      ].join('\n'))
    }
  
    if (op === 'create' || op === 'new') {
      const title = parsed.positional.slice(1).join(' ').trim()
        || (typeof parsed.flags.title === 'string' ? parsed.flags.title : '')
        || 'Untitled'
      const stableDocumentId = internal.idempotencyKey
        ? `doc_agent_${createHash('sha256').update(internal.idempotencyKey).digest('hex').slice(0, 32)}`
        : null
      if (stableDocumentId) {
        const { rows } = await pool.query(`SELECT 1 FROM documents WHERE id=$1 AND company_id=$2 AND project_id=$3`, [stableDocumentId, companyId, projectId])
        if (rows[0]) return ok(`created document ${stableDocumentId}: ${title} [replayed]`)
      }
  
      // Tenant-scoped claim by title so two agents don't independently
      // create overlapping docs ("Q3 plan v1", "Q3 plan v2", "Q3 plan
      // draft"). The title is the dedup key — close-enough titles will
      // still collide thanks to subject normalization.
      const blocked = await tryClaimTenantWork(companyId, me, 'doc-create', title)
      if (blocked) return blocked
  
      try {
        // The claim above only guards work IN FLIGHT — it's released the
        // moment the first creator finishes, so it cannot stop a SEQUENTIAL
        // duplicate (2026-06-12: nova created+released 《第七天的猫》 at
        // :17, saga's claim sailed through clean at :22 → two docs). Check
        // the authoritative table for a same-title doc another agent just
        // created: if one exists, the work is DONE — point at it instead of
        // duplicating. This runs inside the claim window, so against a
        // CONCURRENT creator we either lose the claim (handled above) or
        // see their committed row here.
        const normTitle = normalizeWorkSubject(title)
        const docHoldScope = `doc-create:${normTitle}`
        const forceArmed = Boolean(parsed.flags.force) && (await consumeHold(me, docHoldScope)).armed
        if (!forceArmed) {
          const { rows: recentDups } = await pool.query<{
            id: string; title: string; created_by: string; created_at: Date
          }>(
            `SELECT id, title, created_by, created_at FROM documents
              WHERE company_id = $1 AND created_by <> $2 AND project_id = $3
                AND created_at > NOW() - INTERVAL '15 minutes'
              ORDER BY created_at DESC LIMIT 50`,
            [companyId, me, projectId],
          )
          const dup = recentDups.find((d) => normalizeWorkSubject(d.title) === normTitle)
          if (dup) {
            await recordHold(me, docHoldScope)
            const ageSec = Math.max(1, Math.round((Date.now() - dup.created_at.getTime()) / 1000))
            return err(
              `HELD — document NOT created. ${dup.created_by} already created "${dup.title}" (${dup.id}) ${ageSec}s ago — ` +
              `this work is DONE; a second copy is duplicate clutter. ` +
              `Build on theirs instead: \`lingxiloop doc read ${dup.id}\` / \`lingxiloop doc append ${dup.id} "..."\`. ` +
              `If you GENUINELY need a separate doc with this same title, rerun with --force ` +
              `(--force only works after you've been shown this hold — passing it preemptively does nothing).`,
              2,
            )
          }
        }
        const id = stableDocumentId ?? `doc_${randomUUID().replace(/-/g, '').slice(0, 16)}`
        await pool.query(
          `INSERT INTO documents (id, company_id, project_id, title, created_by) VALUES ($1, $2, $3, $4, $5)`,
          [id, companyId, projectId, title.slice(0, 200), me],
        )
        // If --body was supplied, seed the doc as one or more paragraphs.
        // Newlines split, so a multi-line body lands as proper block
        // structure (not a single 1500-char paragraph) in the rich editor.
        const body = typeof parsed.flags.body === 'string' ? unescapeChat(parsed.flags.body) : ''
        if (body) {
          const { applyAgentEdit } = await import('../../modules/documents/public.js')
          await applyAgentEdit(id, companyId, me, [{ kind: 'append', text: body }])
        }
        await publishDocChanged(companyId, id, 'document.created', me)
        return ok(`created document ${id}: ${title}`, [{
          event: 'document.created',
          command: 'doc create',
          documentId: id,
          actorId: me,
          companyId,
          title,
          bodyLength: body.length,
          visibleToUser: true,
        }])
      } finally {
        await releaseTenantWork(companyId, me, 'doc-create', title)
      }
    }
  
    if (op === 'read' || op === 'show') {
      const docId = parsed.positional[1]
      if (!docId) return err('usage: doc read <document_id>')
      const { rows } = await pool.query<{ company_id: string; title: string }>(
        `SELECT company_id, title FROM documents WHERE id = $1 LIMIT 1`, [docId],
      )
      if (rows.length === 0 || rows[0].company_id !== companyId) return err(`document ${docId} not found`)
      const { readDocumentText } = await import('../../modules/documents/public.js')
      const body = await readDocumentText(docId, companyId)
      if (parsed.flags.json) return ok(JSON.stringify({ id: docId, title: rows[0].title, body }, null, 2))
      return ok([
        `# ${rows[0].title}  (${docId})`,
        '',
        body || '(empty)',
      ].join('\n'))
    }
  
    if (op === 'share') {
      const docId = parsed.positional[1]
      const conversationId = typeof parsed.flags.conversation === 'string'
        ? parsed.flags.conversation.trim()
        : ''
      const comment = typeof parsed.flags.comment === 'string'
        ? unescapeChat(parsed.flags.comment).trim()
        : ''
      if (!docId || !conversationId) {
        return err('usage: doc share <document_id> --conversation <conversation_id> [--comment "<text>"]')
      }
  
      const { rows: documents } = await pool.query<{ title: string }>(
        `SELECT title FROM documents WHERE id = $1 AND company_id = $2 LIMIT 1`,
        [docId, companyId],
      )
      if (!documents[0]) return err(`document ${docId} not found`)
  
      const { rows: conversations } = await pool.query<{ members: string[] }>(
        `SELECT members FROM conversations WHERE id = $1 AND company_id = $2 AND project_id = $3 LIMIT 1`,
        [conversationId, companyId, projectId],
      )
      if (!conversations[0]) return err(`unknown conversation ${conversationId}`)
      if (!conversations[0].members.includes(me)) {
        return err(`${me} is not a member of ${conversationId}`)
      }
  
      const body = [comment, `文档：${docId}`].filter(Boolean).join('\n\n')
      const reply = { ...parsed, positional: [conversationId, body] }
      return await cmdReply(reply, internal)
    }
  
    if (op === 'append') {
      const docId = parsed.positional[1]
      const text = parsed.positional.slice(2).join(' ').trim()
        || (typeof parsed.flags.text === 'string' ? unescapeChat(parsed.flags.text) : '')
      if (!docId || !text) return err('usage: doc append <document_id> "<text>"')
      const { rows } = await pool.query<{ company_id: string }>(
        `SELECT company_id FROM documents WHERE id = $1 LIMIT 1`, [docId],
      )
      if (rows.length === 0 || rows[0].company_id !== companyId) return err(`document ${docId} not found`)
      const { applyAgentEdit } = await import('../../modules/documents/public.js')
      await applyAgentEdit(docId, companyId, me, [{ kind: 'append', text }])
      await publishDocChanged(companyId, docId, 'document.updated', me)
      return ok(`appended ${text.length} chars to ${docId}`, [{
        event: 'document.updated',
        command: 'doc append',
        documentId: docId,
        actorId: me,
        companyId,
        editKind: 'append',
        bodyLength: text.length,
        visibleToUser: true,
      }])
    }
  
    if (op === 'prepend') {
      const docId = parsed.positional[1]
      const text = parsed.positional.slice(2).join(' ').trim()
        || (typeof parsed.flags.text === 'string' ? unescapeChat(parsed.flags.text) : '')
      if (!docId || !text) return err('usage: doc prepend <document_id> "<text>"')
      const { rows } = await pool.query<{ company_id: string }>(
        `SELECT company_id FROM documents WHERE id = $1 LIMIT 1`, [docId],
      )
      if (rows.length === 0 || rows[0].company_id !== companyId) return err(`document ${docId} not found`)
      const { applyAgentEdit } = await import('../../modules/documents/public.js')
      await applyAgentEdit(docId, companyId, me, [{ kind: 'insertParagraph', at: 'start', text }])
      await publishDocChanged(companyId, docId, 'document.updated', me)
      return ok(`prepended ${text.length} chars to ${docId}`, [{
        event: 'document.updated',
        command: 'doc prepend',
        documentId: docId,
        actorId: me,
        companyId,
        editKind: 'prepend',
        bodyLength: text.length,
        visibleToUser: true,
      }])
    }
  
    if (op === 'image') {
      // Direct image-block insert. The markdown route (`doc append "![alt](url)"`)
      // is the more idiomatic affordance but it goes through a line-based regex
      // that struggles when the URL wraps mid-emit (long presigned attachment
      // links do this routinely). This subcommand bypasses parsing — agents
      // pass src + optional alt and get a guaranteed image node.
      //
      // Placement is layered: absolute (`--at end|start`, default end) gives
      // a coarse "drop it somewhere" insert, while anchored placements
      // (`--replace`, `--after`, `--before`) take a snippet of existing
      // text and place the image relative to the block containing it. The
      // killer use case for `--replace` is swapping a previously-emitted
      // but inert `![alt](url)` markdown paragraph for a real image node:
      // the agent passes the exact markdown text as the anchor and the
      // broken text gets replaced by the image inline.
      const docId = parsed.positional[1]
      const src = parsed.positional[2]
        || (typeof parsed.flags.src === 'string' ? unescapeChat(parsed.flags.src) : '')
      const alt = typeof parsed.flags.alt === 'string' ? unescapeChat(parsed.flags.alt).trim() : ''
      const replaceAnchor = typeof parsed.flags.replace === 'string' ? unescapeChat(parsed.flags.replace) : ''
      const afterAnchor = typeof parsed.flags.after === 'string' ? unescapeChat(parsed.flags.after) : ''
      const beforeAnchor = typeof parsed.flags.before === 'string' ? unescapeChat(parsed.flags.before) : ''
      const atRaw = typeof parsed.flags.at === 'string' ? parsed.flags.at.trim().toLowerCase() : 'end'
      if (!docId || !src) return err('usage: doc image <document_id> <url> [--alt "..."] [--at end|start | --replace "..." | --after "..." | --before "..."]')
      if (!/^https?:\/\//i.test(src)) return err('image url must be http(s)://')
  
      // Pick the placement mode. Anchored flags win over `--at`. If more
      // than one anchor is supplied we surface an error rather than pick
      // arbitrarily — the agent should declare intent unambiguously.
      const anchors = [
        ['replace', replaceAnchor],
        ['after', afterAnchor],
        ['before', beforeAnchor],
      ].filter(([, v]) => v) as Array<['replace' | 'after' | 'before', string]>
      if (anchors.length > 1) {
        return err(`pass only one of --replace / --after / --before (got ${anchors.length})`)
      }
      let placement: { mode: 'start' | 'end' } | { mode: 'replace' | 'after' | 'before'; anchorText: string }
      if (anchors.length === 1) {
        placement = { mode: anchors[0][0], anchorText: anchors[0][1] }
      } else {
        placement = { mode: atRaw === 'start' ? 'start' : 'end' }
      }
  
      const { rows } = await pool.query<{ company_id: string }>(
        `SELECT company_id FROM documents WHERE id = $1 LIMIT 1`, [docId],
      )
      if (rows.length === 0 || rows[0].company_id !== companyId) return err(`document ${docId} not found`)
      const { applyAgentEdit, isAnchoredImagePlacement } = await import('../../modules/documents/public.js')
      const result = await applyAgentEdit(docId, companyId, me, [{ kind: 'image', src, alt: alt || null, placement }])
  
      // Anchor miss is a HARD error now — falling back to end-of-doc on a
      // missed snippet is how the doc collected duplicate inert images
      // in the first place. Return without firing the change event so the
      // agent's bash exit code reflects the failure and it knows to retry
      // with a different snippet (or stop trying).
      if (isAnchoredImagePlacement(placement) && result.imagePlaced === 'anchor-missed') {
        const snippet = placement.anchorText.slice(0, 60)
        return err(`anchor not found in ${docId}: "${snippet}". Re-read the doc and pick a snippet that uniquely identifies the target block — no image was inserted.`)
      }
      await publishDocChanged(companyId, docId, 'document.updated', me)
  
      let where: string
      if (isAnchoredImagePlacement(placement)) {
        where = `${placement.mode} block containing "${placement.anchorText.slice(0, 60)}"`
      } else {
        where = placement.mode === 'start' ? 'at start' : 'at end'
      }
      return ok(`inserted image into ${docId} ${where}`, [{
        event: 'document.updated',
        command: 'doc image',
        documentId: docId,
        actorId: me,
        companyId,
        editKind: 'image',
        visibleToUser: true,
      }])
    }
  
    if (op === 'image-delete') {
      // Counterpart to `doc image`. Used when a doc has duplicate or
      // unwanted image blocks (e.g. earlier attempts that fell back to
      // end-of-doc when --replace missed, before misses became
      // removed). Match by exact src, src substring, or alt text.
      const docId = parsed.positional[1]
      const srcExact = typeof parsed.flags.src === 'string' ? unescapeChat(parsed.flags.src) : ''
      const srcContains = typeof parsed.flags['src-contains'] === 'string' ? unescapeChat(parsed.flags['src-contains']) : ''
      const altMatch = typeof parsed.flags.alt === 'string' ? unescapeChat(parsed.flags.alt) : ''
      const provided = [srcExact, srcContains, altMatch].filter(Boolean)
      if (!docId || provided.length === 0) {
        return err('usage: doc image-delete <document_id> [--src <exact_url> | --src-contains <substr> | --alt <text>]')
      }
      if (provided.length > 1) {
        return err('pass only one of --src / --src-contains / --alt')
      }
      const { rows } = await pool.query<{ company_id: string }>(
        `SELECT company_id FROM documents WHERE id = $1 LIMIT 1`, [docId],
      )
      if (rows.length === 0 || rows[0].company_id !== companyId) return err(`document ${docId} not found`)
      const match: import('../../modules/documents/public.js').AgentImageDeleteMatch =
        srcExact ? { by: 'src', src: srcExact }
          : srcContains ? { by: 'src-contains', substring: srcContains }
            : { by: 'alt', alt: altMatch }
      const { applyAgentEdit } = await import('../../modules/documents/public.js')
      const result = await applyAgentEdit(docId, companyId, me, [{ kind: 'imageDelete', match }])
      if (result.imagesDeleted === 0) {
        return err(`no images in ${docId} matched the criterion`)
      }
      await publishDocChanged(companyId, docId, 'document.updated', me)
      return ok(`deleted ${result.imagesDeleted} image${result.imagesDeleted === 1 ? '' : 's'} from ${docId}`, [{
        event: 'document.updated',
        command: 'doc image-delete',
        documentId: docId,
        actorId: me,
        companyId,
        editKind: 'image-delete',
        imagesDeleted: result.imagesDeleted,
        visibleToUser: true,
      }])
    }
  
    if (op === 'replace') {
      const docId = parsed.positional[1]
      const find = typeof parsed.flags.find === 'string' ? unescapeChat(parsed.flags.find) : ''
      const replace = typeof parsed.flags.replace === 'string' ? unescapeChat(parsed.flags.replace) : ''
      if (!docId || !find) return err('usage: doc replace <document_id> --find "..." --replace "..."')
      const { rows } = await pool.query<{ company_id: string }>(
        `SELECT company_id FROM documents WHERE id = $1 LIMIT 1`, [docId],
      )
      if (rows.length === 0 || rows[0].company_id !== companyId) return err(`document ${docId} not found`)
      const { applyAgentEdit } = await import('../../modules/documents/public.js')
      const r = await applyAgentEdit(docId, companyId, me, [{ kind: 'replace', find, replace }])
      if (r.replaced === 0) return err(`text not found in ${docId}: ${JSON.stringify(find).slice(0, 80)}`)
      await publishDocChanged(companyId, docId, 'document.updated', me)
      return ok(`replaced ${r.replaced} occurrence in ${docId}`, [{
        event: 'document.updated',
        command: 'doc replace',
        documentId: docId,
        actorId: me,
        companyId,
        editKind: 'replace',
        replaced: r.replaced,
        visibleToUser: true,
      }])
    }
  
    if (op === 'replace-block') {
      const docId = parsed.positional[1]
      const anchor = typeof parsed.flags.anchor === 'string' ? unescapeChat(parsed.flags.anchor) : ''
      const text = parsed.positional.slice(2).join(' ').trim()
        || (typeof parsed.flags.text === 'string' ? unescapeChat(parsed.flags.text) : '')
      if (!docId || !anchor || !text) return err('usage: doc replace-block <document_id> --anchor "<snippet in the block>" "<replacement markdown>"')
      const { rows } = await pool.query<{ company_id: string }>(
        `SELECT company_id FROM documents WHERE id = $1 LIMIT 1`, [docId],
      )
      if (rows.length === 0 || rows[0].company_id !== companyId) return err(`document ${docId} not found`)
      const { applyAgentEdit } = await import('../../modules/documents/public.js')
      const r = await applyAgentEdit(docId, companyId, me, [{ kind: 'replaceBlock', anchorText: anchor, text }])
      if (r.blocksReplaced === 0) return err(`no block containing ${JSON.stringify(anchor).slice(0, 80)} in ${docId}`)
      await publishDocChanged(companyId, docId, 'document.updated', me)
      return ok(`replaced 1 block in ${docId}`, [{
        event: 'document.updated',
        command: 'doc replace-block',
        documentId: docId,
        actorId: me,
        companyId,
        editKind: 'replace-block',
        visibleToUser: true,
      }])
    }
  
    if (op === 'rename') {
      const docId = parsed.positional[1]
      const title = parsed.positional.slice(2).join(' ').trim()
        || (typeof parsed.flags.title === 'string' ? parsed.flags.title : '')
      if (!docId || !title) return err('usage: doc rename <document_id> "<title>"')
      const r = await pool.query(
        `UPDATE documents SET title = $1, updated_at = NOW()
          WHERE id = $2 AND company_id = $3`,
        [title.slice(0, 200), docId, companyId],
      )
      if (!r.rowCount) return err(`document ${docId} not found`)
      await publishDocChanged(companyId, docId, 'document.updated', me)
      return ok(`renamed ${docId} to "${title}"`, [{
        event: 'document.updated',
        command: 'doc rename',
        documentId: docId,
        actorId: me,
        companyId,
        editKind: 'rename',
        title,
        visibleToUser: true,
      }])
    }
  
    if (op === 'delete' || op === 'rm') {
      const docId = parsed.positional[1]
      if (!docId) return err('usage: doc delete <document_id>')
      const { rows } = await pool.query<{ created_by: string }>(
        `SELECT created_by FROM documents WHERE id = $1 AND company_id = $2 LIMIT 1`,
        [docId, companyId],
      )
      if (rows.length === 0) return err(`document ${docId} not found`)
      if (rows[0].created_by !== me) return err(`only the creator can delete document ${docId}`)
      await pool.query(`DELETE FROM documents WHERE id = $1`, [docId])
      await publishDocChanged(companyId, docId, 'document.deleted', me, projectId)
      return ok(`deleted document ${docId}`, [{
        event: 'document.deleted',
        command: 'doc delete',
        documentId: docId,
        actorId: me,
        companyId,
        visibleToUser: true,
      }])
    }
  
    return err(`unknown doc op: ${op}\nusage: doc {ls|create|read|append|prepend|image|image-delete|replace|rename|delete} ...`)
  }
  
  return { cmdDoc }
}
