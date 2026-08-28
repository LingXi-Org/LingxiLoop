import { HttpError } from '../../http/errors.js'
import { LearningApplicationError } from './application.js'

type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: { issues: Array<{ message: string }> } }

export function parseLearningRequest<T>(result: ParseResult<T>): T {
  if (!result.success) throw new HttpError(400, result.error.issues[0]?.message ?? 'invalid request')
  return result.data
}

function mapLearningError(error: unknown): never {
  if (!(error instanceof LearningApplicationError)) throw error
  const status = {
    invalid: 400,
    not_found: 404,
    forbidden: 403,
    conflict: 409,
    gone: 410,
    unauthorized: 401,
  }[error.code]
  throw new HttpError(status, error.message)
}

export async function respondWithLearning<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    mapLearningError(error)
  }
}
