import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import type { CompanyStatus, CompanyType, ProjectKind, ProjectStatus } from '../../domain/public.js'
import { safe } from '../../http/async-handler.js'
import { HttpError } from '../../http/errors.js'
import { requireAuth } from '../../http/request-context.js'
import { applySystemCompanyLifecycleInTransaction, CompanyLifecycleError } from '../companies/public.js'
import { auditInTransaction } from '../identity/public.js'
import { applySystemProjectLifecycleInTransaction, ProjectLifecycleError } from '../projects/public.js'

// Mounted after adminRouter's signed platform identity check. Product routes keep
// their company/project membership checks; only these explicit commands elevate.
export const platformLifecycleRouter = Router()
const reasonSchema = z.object({ reason: z.string().trim().min(1).max(280) }).strict()
const companyCommands = { activate: 'ACTIVATE', 'enter-read-only': 'ENTER_READ_ONLY', archive: 'ARCHIVE' } as const
const projectCommands = { activate: 'ACTIVATE', end: 'END', 'enter-read-only': 'ENTER_READ_ONLY', archive: 'ARCHIVE' } as const

for (const [action, command] of Object.entries(companyCommands)) {
  platformLifecycleRouter.post(`/companies/:id/${action}`, safe(async (req, res) => {
    const { reason } = reasonSchema.parse(req.body)
    const actorUserId = requireAuth(req), companyId = String(req.params.id)
    try {
      res.json(await withTransaction(pool, async db => {
        const company = (await db.query<{ type: CompanyType; status: CompanyStatus }>(`SELECT type,status FROM companies WHERE id=$1 FOR UPDATE`, [companyId])).rows[0]
        if (!company) throw new HttpError(404, 'company not found')
        const result = await applySystemCompanyLifecycleInTransaction(db, { actorUserId, companyId, ...company, command })
        await auditInTransaction(db, { kind: 'platform_admin.lifecycle', userId: actorUserId, companyId, detail: { resource: 'companies', id: companyId, action, reason, ...result } })
        return result
      }))
    } catch (error) {
      if (error instanceof CompanyLifecycleError) throw new HttpError(409, error.message)
      throw error
    }
  }))
}

for (const [action, command] of Object.entries(projectCommands)) {
  platformLifecycleRouter.post(`/projects/:id/${action}`, safe(async (req, res) => {
    const { reason } = reasonSchema.parse(req.body)
    const actorUserId = requireAuth(req), projectId = String(req.params.id)
    try {
      res.json(await withTransaction(pool, async db => {
        const project = (await db.query<{ company_id: string; kind: ProjectKind; status: ProjectStatus }>(`SELECT company_id,kind,status FROM projects WHERE id=$1 FOR UPDATE`, [projectId])).rows[0]
        if (!project) throw new HttpError(404, 'project not found')
        const result = await applySystemProjectLifecycleInTransaction(db, { actorUserId, companyId: project.company_id, projectId, kind: project.kind, status: project.status, command })
        await auditInTransaction(db, { kind: 'platform_admin.lifecycle', userId: actorUserId, companyId: project.company_id, detail: { resource: 'projects', id: projectId, action, reason, ...result } })
        return result
      }))
    } catch (error) {
      if (error instanceof ProjectLifecycleError) throw new HttpError(409, error.message)
      throw error
    }
  }))
}
