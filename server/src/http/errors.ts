import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { env } from '../env.js'
import { ForbiddenError } from '../modules/access/public.js'

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'invalid request',
      issues: err.issues.map((issue) => ({ path: issue.path, message: issue.message })),
    })
    return
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message })
    return
  }
  if (err instanceof ForbiddenError) {
    res.status(err.status).json({ error: err.message })
    return
  }
  const status = (err as { status?: unknown; statusCode?: unknown } | null)?.status
    ?? (err as { statusCode?: unknown } | null)?.statusCode
  if (err instanceof Error && Number.isInteger(status) && Number(status) >= 400 && Number(status) < 600) {
    res.status(Number(status)).json({ error: err.message })
    return
  }
  console.error('[api] 500', err)
  if (env.NODE_ENV !== 'production') {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    res.status(500).json({ error: message, stack })
    return
  }
  res.status(500).json({ error: 'internal server error' })
}
