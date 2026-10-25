/** Presigned PUT with byte progress. Cookies and product headers stay off object storage. */
export function putMaterialFile(uploadUrl: string, file: File, mime: string, onProgress: (percent: number) => void): Promise<{ ok: boolean; status: number }> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PUT', uploadUrl)
    request.setRequestHeader('Content-Type', mime)
    request.upload.onprogress = event => {
      if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100))
    }
    request.onload = () => resolve({ ok: request.status >= 200 && request.status < 300, status: request.status })
    request.onerror = () => reject(new Error('上传连接中断，请重试。'))
    request.onabort = () => reject(new Error('上传已取消，请重试。'))
    request.timeout = 15 * 60 * 1000
    request.ontimeout = () => reject(new Error('上传超时，请重试。'))
    request.send(file)
  })
}
