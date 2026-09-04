import type { NextFunction, Request, Response } from 'express'
import type { AuthedRequest } from '../../auth.js'
import { pool } from '../../db/pool.js'
import { audit } from '../identity/public.js'
import { platformAdminIdentity } from './authorization.js'

export function platformAdminCommandAuditMiddleware(
  request: Request & AuthedRequest,
  response: Response,
  next: NextFunction,
): void {
  const userId = request.authUserId
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS' || !userId) {
    next()
    return
  }
  response.on('finish', () => {
    void platformAdminIdentity(pool, userId).then((identity) => {
      if (!identity) return
      return audit({
        kind: 'platform_admin.command',
        userId,
        companyId: typeof request.headers['x-company-id'] === 'string' ? request.headers['x-company-id'] : null,
        ip: request.socket.remoteAddress ?? null,
        userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : null,
        detail: {
          method: request.method,
          path: request.path,
          projectId: typeof request.headers['x-project-id'] === 'string' ? request.headers['x-project-id'] : null,
          reason: typeof request.headers['x-platform-admin-reason'] === 'string'
            ? request.headers['x-platform-admin-reason'].slice(0, 280)
            : null,
          status: response.statusCode,
        },
      })
    }).catch((error: unknown) => console.error('[platform-operations] command audit failed', error))
  })
  next()
}
