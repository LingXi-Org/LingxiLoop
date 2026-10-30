/** Product-owned source namespaces must have an active download authorizer.
 * Source-free runtime/user artifacts keep their existing run authorization. */
export function supportsArtifactSource(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const source = Reflect.get(value, 'source')
  return source === undefined || source !== null && typeof source === 'object'
    && typeof source.ref === 'string' && source.ref.startsWith('document:')
}
