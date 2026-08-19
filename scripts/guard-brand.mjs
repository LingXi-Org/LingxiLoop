import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const retired = ['cu', 'mora'].join('')
const listed = spawnSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)

if (listed.status !== 0) {
  process.stderr.write(listed.stderr || 'Unable to enumerate repository files.\n')
  process.exit(1)
}

const failures = []
for (const file of listed.stdout.split('\0').filter(Boolean)) {
  if (!existsSync(file)) continue
  if (file.toLowerCase().includes(retired)) failures.push(`${file}: retired brand in path`)

  const body = readFileSync(file)
  if (body.includes(0)) continue
  const text = body.toString('utf8').toLowerCase()
  if (text.includes(retired)) failures.push(`${file}: retired brand in content`)
}

if (failures.length > 0) {
  process.stderr.write(`Brand guard failed:\n${failures.join('\n')}\n`)
  process.exit(1)
}

console.log('Brand guard passed: repository paths and text use LingxiLoop naming only.')
