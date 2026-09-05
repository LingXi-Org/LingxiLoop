import type { NextFunction, Request, Response } from 'express'
import type { AuthedRequest } from '../auth.js'

export function safe(handler: (req: Request & AuthedRequest, res: Response) => Promise<void> | void) {
  return async (req: Request & AuthedRequest, res: Response, next: NextFunction) => {
    try {
      await handler(req, res)
    } catch (error) {
      next(error)
    }
  }
}
