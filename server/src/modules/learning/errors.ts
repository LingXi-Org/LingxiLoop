export type LearningApplicationErrorCode =
  | 'invalid'
  | 'not_found'
  | 'forbidden'
  | 'conflict'
  | 'gone'
  | 'unauthorized'

export class LearningApplicationError extends Error {
  constructor(readonly code: LearningApplicationErrorCode, message: string) {
    super(message)
  }
}
