export class UploadFailure extends Error {
  constructor(readonly code: 'file_type' | 'file_size' | 'upload_signing' | 'upload_interrupted' | 'upload_rejected' | 'identity_changed', readonly status?: number) {
    const messages = {
      file_type: '此文件格式暂不支持，请选择支持的文件。',
      file_size: '文件为空或超过上传大小限制，请检查文件后重试。',
      upload_signing: '暂时未能取得上传链接，请重试上传。',
      upload_interrupted: '上传连接中断，请重试。已上传的附件会保留。',
      upload_rejected: '文件上传未被接收，请重试上传。',
      identity_changed: '账号已切换，请在当前页面重新选择文件。',
    }
    super(messages[code])
    this.name = 'UploadFailure'
  }
}
