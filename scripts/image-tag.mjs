#!/usr/bin/env node
// Content-addressed image tags. A tag is the hash of every committed file the
// target's Dockerfile stages COPY from the build context, plus the Dockerfile,
// its .dockerignore and the build args. Unchanged inputs keep the same tag, so
// CI skips the build and `docker compose up` leaves the service running.
//
//   node scripts/image-tag.mjs json   # CI build matrix
//   node scripts/image-tag.mjs env    # SERVER_IMAGE=... lines for deploy/*/compose.yml
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { posix } from 'node:path'
import { fileURLToPath } from 'node:url'

// Everything is read from the committed HEAD, never the working tree.
const git = (...args) => execFileSync('git', args, { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8' })
const committed = path => git('show', `HEAD:${path}`)
const tracked = path => git('ls-tree', '--name-only', 'HEAD', '--', path).trim() === path

const REGISTRY = 'ghcr.io/lingxi-org'
// Hosts in mainland China pull through this GHCR accelerator.
const PULL_REGISTRY = `accel.way2api.fun/${REGISTRY}`

export const IMAGES = [
  { name: 'server', package: 'lingxiloop-server', dockerfile: 'server/docker/lingxiloop-server.Dockerfile', context: '.', target: 'runtime',
    args: { LINGXILOOP_VERSION: committed('VERSION').trim() } },
  { name: 'gateway', package: 'lingxiloop-gateway', dockerfile: 'deploy/app-b/gateway.Dockerfile', context: '.', target: '', args: {} },
  { name: 'wukongim', package: 'lingxiloop-wukongim', dockerfile: 'server/docker/wukongim.Dockerfile', context: '.', target: 'release',
    args: { WUKONG_COMMIT: 'c7f663fa23a4ee2c6f7e08c68423f50f0f6e9c47' } },
  { name: 'notebook', package: 'lingxiloop-open-notebook', dockerfile: 'third_party/open-notebook/Dockerfile', context: 'third_party/open-notebook', target: 'lingxiloop-rag', args: {} },
]

// Stages reachable from the target, with the context paths each one COPYs.
function contextInputs(dockerfile, target) {
  const stages = []
  for (const raw of committed(dockerfile).replace(/\\\r?\n/g, ' ').split(/\r?\n/)) {
    const line = raw.trim()
    const from = line.match(/^FROM\s+(?:--\S+\s+)*(\S+)(?:\s+AS\s+(\S+))?/i)
    if (from) { stages.push({ name: from[2] ?? '', base: from[1], deps: new Set(), copies: [] }); continue }
    const copy = line.match(/^(?:COPY|ADD)\s+(.*)$/i)
    if (!copy || !stages.length) continue
    const words = copy[1].split(/\s+/)
    const flags = words.filter(word => word.startsWith('--'))
    const fromFlag = flags.find(flag => flag.startsWith('--from='))
    if (fromFlag) stages.at(-1).deps.add(fromFlag.slice(7))
    else stages.at(-1).copies.push(...words.filter(word => !word.startsWith('--')).slice(0, -1))
  }
  const byName = new Map(stages.map(stage => [stage.name, stage]))
  const seen = new Set()
  const visit = stage => {
    if (!stage || seen.has(stage)) return
    seen.add(stage)
    visit(byName.get(stage.base))
    for (const dep of stage.deps) visit(byName.get(dep))
  }
  visit(target ? byName.get(target) : stages.at(-1))
  return [...seen].flatMap(stage => stage.copies)
}

export function imageTag(image) {
  const prefix = image.context === '.' ? '' : `${image.context}/`
  const ignore = tracked(`${image.dockerfile}.dockerignore`) ? `${image.dockerfile}.dockerignore` : `${prefix}.dockerignore`
  const paths = [image.dockerfile, ...(tracked(ignore) ? [ignore] : []),
    ...contextInputs(image.dockerfile, image.target).map(path => posix.normalize(prefix + path.replace(/^\.\//, '')))]
  const tree = git('ls-tree', '-r', 'HEAD', '--', ...new Set(paths))
  return createHash('sha256').update(JSON.stringify([image.target, image.args, tree])).digest('hex').slice(0, 24)
}

if (process.argv[1]?.endsWith('image-tag.mjs')) {
  const images = IMAGES.map(image => ({ ...image, tag: imageTag(image) }))
  if (process.argv[2] === 'json') {
    console.log(JSON.stringify(images.map(image => ({
      ...image, ref: `${REGISTRY}/${image.package}:${image.tag}`,
      build_args: Object.entries(image.args).map(([key, value]) => `${key}=${value}`).join('\n'),
    }))))
  } else if (process.argv[2] === 'env') {
    for (const image of images) console.log(`${image.name.toUpperCase()}_IMAGE=${PULL_REGISTRY}/${image.package}:${image.tag}`)
  } else {
    console.error('usage: node scripts/image-tag.mjs json|env')
    process.exit(2)
  }
}
