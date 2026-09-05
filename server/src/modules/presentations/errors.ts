export class ContentGenerationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ContentGenerationError'
  }
}

export class PublicationAttentionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PublicationAttentionError'
  }
}
