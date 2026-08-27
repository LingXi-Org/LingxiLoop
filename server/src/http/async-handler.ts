import type { NextFunction, Request, Response } from 'express'
import type { AuthedRequest } from '../auth.js'
import { HttpError } from './errors.js'

export function safe(handler: (req: Request & AuthedRequest, res: Response) => Promise<void> | void) {
  return async (req: Request & AuthedRequest, res: Response, next: NextFunction) => {
    try {
      await handler(req, res)
    } catch (error) {
      if (error instanceof HttpError) {
        res.status(error.status).json({ error: error.message })
        return
      }
      console.error('[api] unhandled', error)
      next(error)
    }
  }
}
