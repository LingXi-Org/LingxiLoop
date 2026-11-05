// One bounded ArrayBuffer at a time, shared by chat and course uploads. Retain
// only the digest while the caller still owns the File; never persist its bytes.
let queue = Promise.resolve()
const checksums = new WeakMap<File, Promise<string>>()
export function uploadChecksum(file: File): Promise<string> {
  let checksum = checksums.get(file)
  if (!checksum) {
    checksum = queue.then(async () => {
      if (file.size > 200 * 1024 * 1024) throw new Error('upload checksum size limit')
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
      return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')
    })
    queue = checksum.then(() => {}, () => {})
    checksums.set(file, checksum)
    void checksum.catch(() => checksums.delete(file))
  }
  return checksum
}
