// The helper wire and durable journal accept only these bounded non-secret fields.
const phases=new Set(['metadata-before','upload','metadata-after','metadata-observe'])
const outcomes=new Set(['verified','absent','http-error','timeout','aborted','connection-reset','connection-closed','dns-error','tls-error','network-error','receipt-invalid','identity-mismatch'])
export function archiveFailureClass(error) {
  const code=error?.cause?.code??error?.code
  if(error?.name==='TimeoutError'||['ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT'].includes(code))return 'timeout'
  if(error?.name==='AbortError'||code==='ABORT_ERR')return 'aborted'
  if(code==='ECONNRESET')return 'connection-reset'
  if(['EPIPE','UND_ERR_SOCKET'].includes(code))return 'connection-closed'
  if(['ENOTFOUND','EAI_AGAIN'].includes(code))return 'dns-error'
  if(['CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE','ERR_TLS_CERT_ALTNAME_INVALID'].includes(code))return 'tls-error'
  return error?.name==='SyntaxError'?'receipt-invalid':'network-error'
}
export function safeArchiveDiagnostics(value) {
  if(value?.version!==1||!Array.isArray(value.events)||value.events.length>3)return undefined
  const events=value.events.filter(row=>row&&phases.has(row.phase)&&outcomes.has(row.outcome)&&Number.isFinite(row.elapsedMs)&&row.elapsedMs>=0&&row.elapsedMs<=3600000).map(row=>({phase:row.phase,outcome:row.outcome,...(Number.isInteger(row.httpStatus)&&row.httpStatus>=100&&row.httpStatus<=599?{httpStatus:row.httpStatus}:{}),elapsedMs:Math.round(row.elapsedMs)}))
  if(events.length!==value.events.length)return undefined
  return {version:1,readAfter:events.find(row=>row.phase==='metadata-after')?.outcome??'not-attempted',events}
}
export function archiveDiagnosticFields(error) {
  const archiveDiagnostics=safeArchiveDiagnostics(error?.archiveDiagnostics)
  return archiveDiagnostics?{archiveDiagnostics}:{}
}
