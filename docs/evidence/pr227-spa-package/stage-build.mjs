// Reproduce the Docker SPA filesystem with existing dependencies; this is not an image build.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync, spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync, createWriteStream } from 'node:fs'
import { dirname, join, matchesGlob, resolve } from 'node:path'
const root = process.cwd(), label = process.argv[2]
assert.match(label ?? '', /^[a-z0-9-]+$/)
const stage = resolve(root, '.codex-tmp', `spa-${label}`)
assert.ok(!existsSync(stage), 'Never overwrite a previous stage/evidence run')
mkdirSync(stage, { recursive: true })
const dockerfile = readFileSync('server/docker/lingxiloop-server.Dockerfile', 'utf8')
const instructions = dockerfile.split(/^FROM /m).find(part => /^.* AS spa-build\r?\n/.test(part))
const ignore = readFileSync('server/docker/lingxiloop-server.Dockerfile.dockerignore', 'utf8')
const rules = ignore.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'))
const files = spawnSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).stdout.split('\0').filter(Boolean)
const inContext = file => {
  const parts = file.split('/'), ancestors = parts.map((_, i) => parts.slice(0, i + 1).join('/'))
  let included = true
  for (const rule of rules) if (ancestors.some(path => matchesGlob(path, rule.replace(/^!/, '')))) included = rule.startsWith('!')
  return included
}
const hashes = {}
for (const line of instructions.split(/\r?\n/).filter(line => /^COPY /.test(line))) {
  const [, ...args] = line.trim().split(/\s+/), destination = args.pop()
  assert.ok(!args.some(arg => arg.startsWith('--') || /[*?]/.test(arg)), 'Explicit local COPY inputs only')
  for (const source of args) {
    const directory = statSync(source).isDirectory()
    for (const file of files.filter(file => directory ? file.startsWith(`${source}/`) : file === source)) {
      if (!inContext(file)) continue
      const target = join(stage, destination, directory ? file.slice(source.length + 1) : file.split('/').at(-1))
      mkdirSync(dirname(target), { recursive: true }); copyFileSync(file, target)
      hashes[target.slice(stage.length + 1)] = createHash('sha256').update(readFileSync(target)).digest('hex')
    }
  }
}
symlinkSync(resolve(root, 'node_modules'), join(stage, 'node_modules'))
const output = resolve(root, 'docs/evidence/pr227-spa-package')
writeFileSync(join(output, `${label}-inputs.json`), JSON.stringify({
  rootSource: spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim(),
  dockerfileSha256: createHash('sha256').update(dockerfile).digest('hex'),
  dockerignoreSha256: createHash('sha256').update(ignore).digest('hex'),
  stage, dependencies: resolve(root, 'node_modules'), inputs: hashes,
}, null, 2) + '\n')
const log = createWriteStream(join(output, `${label}-build.log`)), started = Date.now()
const child = spawn('npm', ['run', 'build'], { cwd: stage, stdio: ['ignore', 'pipe', 'pipe'] })
child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false })
child.on('close', code => {
  log.end(); const result = { command: 'npm run build', exitCode: code, elapsedMs: Date.now() - started, sourceMount: false, dependenciesSymlink: true, finalImage: false }
  writeFileSync(join(output, `${label}-build-result.json`), JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result)); process.exitCode = code ?? 1
})
