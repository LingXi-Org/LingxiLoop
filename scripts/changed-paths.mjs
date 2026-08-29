import { spawnSync } from 'node:child_process'

function normalizePath(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//, '')
}

export function normalizeTaskPaths(values) {
  const paths = values.map(normalizePath).filter(Boolean)
  for (const path of paths) {
    if (path.startsWith('/') || /^[A-Za-z]:/.test(path) || path.split('/').includes('..')) {
      throw new Error(`--path must be repository-relative: ${path}`)
    }
  }
  return [...new Set(paths)].sort((a, b) => a.localeCompare(b, 'en'))
}

function runGit(arguments_) {
  const result = spawnSync('git', arguments_, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim()
    throw new Error(`git ${arguments_.join(' ')} failed${detail ? `: ${detail}` : ''}`)
  }
  return result.stdout
}

function zeroSeparatedPaths(output) {
  return output.split('\0').map(normalizePath).filter(Boolean)
}

export function parseScopeArguments(arguments_, { allowTests = false } = {}) {
  const remaining = []
  const paths = []
  const tests = []
  let base
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]
    if (!['--base', '--path', '--test'].includes(argument)) {
      remaining.push(argument)
      continue
    }
    const value = arguments_[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`)
    if (argument === '--base') {
      if (base) throw new Error('--base requires one explicit Git ref')
      base = value
    } else if (argument === '--path') {
      paths.push(value)
    } else if (!allowTests) {
      throw new Error('--test is not supported by this command')
    } else {
      tests.push(value)
    }
    index += 1
  }
  const normalizedPaths = normalizeTaskPaths(paths)
  if (base && normalizedPaths.length > 0) throw new Error('--path cannot be combined with --base')
  return {
    base,
    paths: normalizedPaths,
    tests: normalizeTaskPaths(tests),
    remaining,
  }
}

export function parseBaseArgument(arguments_) {
  const { base, remaining } = parseScopeArguments(arguments_)
  return { base, remaining }
}

export function changedPaths({ base, paths = [] } = {}) {
  if (paths.length > 0) return normalizeTaskPaths(paths)
  if (!base) return []

  const mergeBase = runGit(['merge-base', base, 'HEAD']).trim()
  return normalizeTaskPaths(zeroSeparatedPaths(runGit([
    'diff', '--name-only', '--diff-filter=ACMRD', '-z', mergeBase, 'HEAD', '--',
  ])))
}
