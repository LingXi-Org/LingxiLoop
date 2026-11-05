/** Browser aliases are normalized only for known existing upload formats. */
const extensionMimes: Readonly<Record<string, string>> = {
  py: 'text/plain', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}
export function canonicalUploadMime(name: string, mime: string): string {
  const provided = mime.split(';')[0].trim().toLowerCase(), extension = name.split('.').at(-1)?.toLowerCase() ?? ''
  const canonical = extensionMimes[extension]
  if (canonical && (!provided || provided === 'application/octet-stream'
    || extension === 'py' && ['text/x-python', 'application/x-python-code', 'text/x-python-script'].includes(provided)
    || ['docx', 'pptx', 'xlsx'].includes(extension) && ['application/zip', 'application/x-zip-compressed'].includes(provided))) return canonical
  return provided || 'application/octet-stream'
}
