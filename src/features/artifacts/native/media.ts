/** Extract a local video frame only after the user chooses a file. */
export async function videoPoster(file: Blob): Promise<Blob> {
  const url = URL.createObjectURL(file), video = document.createElement('video')
  video.preload = 'auto'; video.muted = true; video.playsInline = true
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    await new Promise<void>((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error('视频封面读取超时，请重试。')), 15_000)
      video.onloadeddata = () => resolve()
      video.onerror = () => reject(new Error('浏览器无法读取此视频。'))
      video.src = url
    })
    const canvas = document.createElement('canvas')
    const ratio = Math.min(1, 1920 / Math.max(video.videoWidth, video.videoHeight))
    canvas.width = Math.max(1, Math.round(video.videoWidth * ratio)); canvas.height = Math.max(1, Math.round(video.videoHeight * ratio))
    const context = canvas.getContext('2d'); if (!context) throw new Error('无法生成视频封面。')
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('无法生成视频封面。')), 'image/png'))
  } finally { clearTimeout(timeout); video.pause(); video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url) }
}
