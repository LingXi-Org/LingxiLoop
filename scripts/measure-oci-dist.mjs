#!/usr/bin/env node
// Measure the exact SPA files in two immutable OCI COPY layers without pulling images.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join, relative } from 'node:path'
import { execFileSync } from 'node:child_process'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

const [repository, beforeDigest, afterDigest] = process.argv.slice(2)
if (!/^ghcr\.io\/[a-z0-9-]+\/[a-z0-9-]+$/.test(repository ?? '') ||
    ![beforeDigest, afterDigest].every(value => /^sha256:[0-9a-f]{64}$/.test(value ?? ''))) {
  console.error('Usage: node scripts/measure-oci-dist.mjs ghcr.io/owner/image sha256:before-layer sha256:after-layer')
  process.exit(2)
}

const name = repository.slice('ghcr.io/'.length)
// urllib follows the environment's HTTPS proxy; Node's native fetch does not.
const download = `
import hashlib,json,sys,urllib.parse,urllib.request
name,digest,path=sys.argv[1:]
query=urllib.parse.urlencode({'scope':f'repository:{name}:pull','service':'ghcr.io'})
with urllib.request.urlopen('https://ghcr.io/token?'+query,timeout=30) as response:
    token=json.load(response)['token']
request=urllib.request.Request('https://ghcr.io/v2/'+name+'/blobs/'+digest,
    headers={'Authorization':'Bearer '+token})
hash=hashlib.sha256()
with urllib.request.urlopen(request,timeout=120) as response, open(path,'wb') as output:
    while chunk:=response.read(1024*1024):
        hash.update(chunk)
        output.write(chunk)
if 'sha256:'+hash.hexdigest()!=digest:
    raise ValueError('blob digest mismatch: '+digest)
`

const scratch = mkdtempSync(join(tmpdir(), 'issue229-dist-'))
const measure = async (label, digest) => {
  const archive = join(scratch, `${label}.tar.gz`)
  execFileSync('python3', ['-c', download, name, digest, archive])
  const compressedLayerBytes = statSync(archive).size

  const paths = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n')
  if (paths.some(path => !['app', 'app/', 'app/dist', 'app/dist/'].includes(path) &&
      (!path.startsWith('app/dist/') || path.split('/').includes('..')))) {
    throw new Error(`unexpected path in dist layer: ${digest}`)
  }
  const root = join(scratch, label)
  mkdirSync(root)
  execFileSync('tar', ['-xzf', archive, '-C', root, '--no-same-owner', '--no-same-permissions'])
  const dist = join(root, 'app', 'dist')
  if (!existsSync(join(dist, 'index.html'))) throw new Error('dist layer lacks index.html')
  const files = []
  const visit = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile()) files.push(path)
      else throw new Error(`unsupported dist entry: ${path}`)
    }
  }
  visit(dist)
  files.sort()
  const categories = Object.fromEntries(['js', 'css', 'html', 'other'].map(key =>
    [key, { files: 0, rawBytes: 0, gzipBytes: 0, brotliBytes: 0 }]))
  const inventoryHash = createHash('sha256')
  const inventory = []
  for (const path of files) {
    const name = relative(dist, path).replaceAll('\\', '/')
    const content = readFileSync(path)
    const hash = createHash('sha256').update(content).digest('hex')
    const category = ['.js', '.css', '.html'].includes(extname(path)) ? extname(path).slice(1) : 'other'
    const stats = categories[category]
    stats.files++
    stats.rawBytes += content.length
    stats.gzipBytes += gzipSync(content, { level: 9, mtime: 0 }).length
    stats.brotliBytes += brotliCompressSync(content, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).length
    inventoryHash.update(`${name}\0${content.length}\0${hash}\n`)
    inventory.push({ path: name, bytes: content.length, sha256: hash })
  }
  const total = Object.values(categories).reduce((sum, stats) => {
    for (const key of Object.keys(sum)) sum[key] += stats[key]
    return sum
  }, { files: 0, rawBytes: 0, gzipBytes: 0, brotliBytes: 0 })
  return { layerDigest: digest, compressedLayerBytes,
    fileInventorySha256: inventoryHash.digest('hex'), total, categories, inventory }
}

try {
  const before = await measure('before', beforeDigest)
  const after = await measure('after', afterDigest)
  const old = new Map(before.inventory.map(file => [file.path, file]))
  const current = new Map(after.inventory.map(file => [file.path, file]))
  const changedPaths = [...new Set([...old.keys(), ...current.keys()])].sort()
    .filter(path => old.get(path)?.sha256 !== current.get(path)?.sha256)
  delete before.inventory
  delete after.inventory
  console.log(JSON.stringify({ repository, method: 'per-file gzip level 9, brotli quality 11',
    before, after, changedPaths }, null, 2))
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
