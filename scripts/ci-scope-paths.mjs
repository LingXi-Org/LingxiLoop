import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, relative, dirname } from 'node:path'

// Reuse the owning filters already reviewed in CI rather than a second drifting
// mapping. The small reader accepts only the literal map/list subset in ci.yml.
export function workflowFilters(text = readFileSync('.github/workflows/ci.yml', 'utf8')) {
  const block = text.replace(/\r\n/g, '\n').split('          filters: |\n')[1]?.split('\n      - id: scope')[0]
  if (!block) throw new Error('CI owning path filters are missing')
  const filters = {}; let name
  for (const line of block.split('\n')) {
    const key = /^            ([\w_]+):\s*$/.exec(line)
    if (key) { name = key[1]; filters[name] = []; continue }
    const entry = /^              - '([^']+)'\s*$/.exec(line)
    if (entry) { if (!name) throw new Error('invalid path filter'); filters[name].push(entry[1]) }
  }
  return filters
}
function glob(pattern, path) {
  const expression = pattern.split(/(\*\*\/|\*\*|\*)/).map(part => part === '**/' ? '(?:.*/)?' : part === '**' ? '.*' : part === '*' ? '[^/]*' : part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('')
  return new RegExp(`^${expression}$`).test(path)
}
function walk(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`])
}
export function runtimeSharedPaths(root = process.cwd()) {
  // Trace relative imports from actual server sources, including transitive
  // browser-owned helpers. Type-only edges are conservative build inputs too.
  const pending = walk(resolve(root, 'server/src')).filter(file => /\.[cm]?tsx?$/.test(file) && !/(?:\.test\.|\/__(?:tests|integration)__\/)/.test(file))
  const visited = new Set(); const shared = new Set()
  while (pending.length) {
    const file = pending.pop()
    if (visited.has(file)) continue
    visited.add(file)
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(/(?:from\s*|import\s*\(|import\s*)['"](\.[^'"]+)['"]/g)) {
      const base = resolve(dirname(file), match[1]).replace(/\.[cm]?js$/, '')
      const target = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find(candidate => existsSync(candidate) && /\.[cm]?tsx?$/.test(candidate))
      if (!target || !target.startsWith(`${root}/`)) continue
      const path = relative(root, target).replaceAll('\\', '/')
      if (path.startsWith('src/') || path.startsWith('shared/')) shared.add(path)
      pending.push(target)
    }
  }
  return shared
}
export function classifyPaths(files, filters = workflowFilters(), shared = runtimeSharedPaths()) {
  const result = {}
  for (const [key, patterns] of Object.entries(filters)) {
    const include = patterns.filter(pattern => !pattern.startsWith('!')), exclude = patterns.filter(pattern => pattern.startsWith('!')).map(pattern => pattern.slice(1))
    const matches = files.filter(file => include.some(pattern => glob(pattern, file)) && !exclude.some(pattern => glob(pattern, file)))
    const name = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
    result[name] = matches.length > 0; result[`${name}Files`] = matches
  }
  const additional = files.filter(file => shared.has(file))
  if (additional.length) { result.serverSource = true; result.serverSourceFiles = [...new Set([...result.serverSourceFiles, ...additional])] }
  result.integrationFiles = result.integrationTestsFiles
  return result
}
