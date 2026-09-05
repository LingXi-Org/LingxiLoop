export interface UploadCapabilities {
  mode: 'r2'
  maxBytes: number
  allowedMimes: string[]
}

export interface PresignedUpload {
  uploadUrl: string
  publicUrl: string
  key: string
  name: string
  mime: string
  size: number
  kind: 'img' | 'file'
}
