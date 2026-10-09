import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

// M0 only: test the published adapter without changing production dependencies.
const root = resolve('.'), evidence = join(root, 'artifacts/interactive-ui/m0')
await mkdir(evidence, { recursive: true })
if (process.argv.includes('--build-evidence')) {
  const entries = {}
  for (const name of ['interactive-ui', 'interactive-adapter']) {
    const html = await readFile(join(root, `.e2e/interactive-site/e2e/${name}.html`), 'utf8')
    const assets = await Promise.all([...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g)].map(match => match[1]))]
      .map(async file => { const content = await readFile(join(root, '.e2e/interactive-site', file)); return { file, bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') } }))
    entries[name] = { htmlSha256: createHash('sha256').update(html).digest('hex'), assets }
  }
  await writeFile(join(evidence, 'build-assets.json'), JSON.stringify({ measuredAt: new Date().toISOString(), entries,
    scope: 'Uncompressed initial HTML-referenced assets of the isolated production multi-entry comparison; dynamic imports excluded; not full product route cost.' }, null, 2))
  console.log('Recorded fixture asset sizes and hashes in artifacts/interactive-ui/m0/build-assets.json')
  process.exit(0)
}
const installed = async name => JSON.parse(await readFile(join(root, 'node_modules', name, 'package.json'), 'utf8')).version
const dependencies = Object.fromEntries(await Promise.all(['react', 'react-dom', 'zod', 'zustand', '@assistant-ui/react', '@openuidev/react-lang']
  .map(async name => [name, await installed(name)])))
Object.assign(dependencies, { '@openuidev/assistant-ui': '0.1.2', '@openuidev/react-ui': '0.17.0', '@openuidev/react-headless': '0.17.0' })
const npmCli = process.env.npm_execpath ?? join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
async function install(name, packages) {
  const prefix = join(root, '.e2e', name)
  await mkdir(prefix, { recursive: true })
  await writeFile(join(prefix, 'package.json'), JSON.stringify({ name, private: true, type: 'module', dependencies: packages }, null, 2))
  let log = ''
  const exitCode = await new Promise((accept, reject) => {
    const child = spawn(process.execPath, [npmCli, 'install', '--prefix', prefix, '--ignore-scripts', '--no-audit', '--no-fund'], {
      cwd: root, windowsHide: true, env: { ...process.env, OPENUI_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1' },
    })
    child.stdout.on('data', chunk => { log += chunk })
    child.stderr.on('data', chunk => { log += chunk })
    child.once('error', reject); child.once('exit', code => accept(code ?? 1))
  })
  await writeFile(join(evidence, `${name}.log`), log)
  const resolvedRuntimePackages = exitCode === 0 ? Object.fromEntries(await Promise.all(['@assistant-ui/core', '@assistant-ui/store', '@assistant-ui/tap', 'assistant-stream']
    .map(async dependency => [dependency, JSON.parse(await readFile(join(prefix, 'node_modules', dependency, 'package.json'), 'utf8')).version]))) : undefined
  return { exitCode, manifest: packages, resolvedRuntimePackages, log: `${name}.log`, prefix: `.e2e/${name}` }
}
const current = await install('openui-adapter-current', dependencies)
const compatible = await install('openui-adapter-compatible', { ...dependencies, zustand: '4.5.7' })
const summary = { checkedAt: new Date().toISOString(), reproduce: 'node e2e/interactive-m0.mjs',
  telemetry: { OPENUI_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1', installScripts: false }, current, compatible,
  note: 'The compatible prefix is a disposable adapter test only. Production keeps the installed Zustand version and direct Renderer.' }
await writeFile(join(evidence, 'dependencies.json'), JSON.stringify(summary, null, 2))
assert.equal(compatible.exitCode, 0, 'Inspect the compatible-prefix log; runtime comparison requires a real installed adapter')
console.log(`Adapter current-stack install: ${current.exitCode === 0 ? 'accepted' : 'rejected'}; isolated compatible install: passed. See artifacts/interactive-ui/m0/dependencies.json`)
