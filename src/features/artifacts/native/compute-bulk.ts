import type { Bounds, BoundsIssue, ThemeResult, ThemeTokens } from './compute-protocol'

export function validateNodeBounds(nodes: readonly Bounds[]): BoundsIssue[] {
  const issues: BoundsIssue[] = [], ids = new Set<string>()
  for (const node of nodes) {
    if (ids.has(node.id)) issues.push({ id: node.id, code: 'duplicate_id' })
    ids.add(node.id)
    if (![node.x, node.y, node.width, node.height].every(Number.isFinite)) issues.push({ id: node.id, code: 'non_finite' })
    else if (node.width < 0 || node.height < 0) issues.push({ id: node.id, code: 'negative_size' })
  }
  return issues
}

const aliasOf = (value: string | number) => typeof value === 'string'
  ? /^\{([^{}]+)\}$/.exec(value)?.[1] ?? /^\$([A-Za-z0-9_.-]+)$/.exec(value)?.[1] : undefined

/** Resolve exact token aliases without treating CSS strings or user text as code. */
export function resolveTheme(tokens: ThemeTokens): ThemeResult {
  const resolved = new Map<string, string | number>()
  const failed = new Map<string, 'missing_token' | 'cyclic_token'>()
  for (const start of Object.keys(tokens)) {
    if (resolved.has(start)) continue
    const chain: string[] = [], visiting = new Set<string>()
    let current = start, value: string | number = tokens[start]
    let failure: 'missing_token' | 'cyclic_token' | undefined
    while (true) {
      if (resolved.has(current)) { value = resolved.get(current)!; failure = failed.get(current); break }
      if (visiting.has(current)) { failure = 'cyclic_token'; break }
      if (!Object.hasOwn(tokens, current)) { failure = 'missing_token'; break }
      visiting.add(current)
      chain.push(current)
      value = tokens[current]
      const alias = aliasOf(value)
      if (alias === undefined) break
      current = alias
    }
    for (const key of chain) {
      resolved.set(key, failure ? tokens[key] : value)
      if (failure) failed.set(key, failure)
    }
  }
  return { tokens: Object.fromEntries(resolved), issues: [...failed].map(([key, code]) => ({ key, code })) }
}
