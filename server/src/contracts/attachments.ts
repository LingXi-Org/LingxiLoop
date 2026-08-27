export interface AttachmentPayload {
  name: string
  kind: 'img' | 'pdf' | 'file' | 'fig'
  url: string
  mime?: string
  size?: number
  key?: string
}
