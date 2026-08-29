import { spawnSync } from 'node:child_process'

function normalizePath(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//, '')
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

export function parseBaseArgument(arguments_) {
  const remaining = []
  let base
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]
    if (argument !== '--base') {
      remaining.push(argument)
      continue
    }
    const value = arguments_[index + 1]
    if (!value || value.startsWith('--') || base) throw new Error('--base requires one explicit Git ref')
    base = value
    index += 1
  }
  return { base, remaining }
}

export function changedPaths(base) {
  const local = [
    ...zeroSeparatedPaths(runGit(['diff', '--name-only', '--diff-filter=ACMRD', '-z', 'HEAD', '--'])),
    ...zeroSeparatedPaths(runGit(['ls-files', '--others', '--exclude-standard', '-z'])),
  ]
  if (!base) return [...new Set(local)].sort((a, b) => a.localeCompare(b, 'en'))

  const mergeBase = runGit(['merge-base', base, 'HEAD']).trim()
  const committed = zeroSeparatedPaths(runGit([
    'diff', '--name-only', '--diff-filter=ACMRD', '-z', mergeBase, 'HEAD', '--',
  ]))
  return [...new Set([...committed, ...local])].sort((a, b) => a.localeCompare(b, 'en'))
}
