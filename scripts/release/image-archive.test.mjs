import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { archiveTag, gzipDockerSave, MAX_ARCHIVE_BYTES, MAX_PARTS, MAX_TAR_BYTES, PART_BYTES, putPart, uploadParts, validateArchive, verifySavedArchive, verifySource } from './image-archive.mjs'

const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
const options = { baseUrl: 'https://release.example.test', token: 'test-only-token' }
const image = { configDigest: hash('config') }
const part = { sha256: hash('part'), size: 4 }
const descriptor = { version: 1, format: 'docker-save+gzip', sha256: hash('archive'), size: 4, uncompressedSize: 10240, tag: archiveTag(image), parts: [part] }
function head(bytes) { return new Response(null, { headers: { 'content-length': String(bytes.length), 'x-lingxi-artifact-sha256': hash(bytes) } }) }
test('archive descriptor fixes safe tag, format, bounded sizes and exact part sum', () => {
  assert.equal(archiveTag(image), `localhost/lingxi-release-cache:sha256-${image.configDigest.slice(7)}`)
  assert.equal(validateArchive(descriptor, image), descriptor)
  for (const changed of [ { tag: 'arbitrary/image:latest' }, { size: MAX_ARCHIVE_BYTES + 1 }, { uncompressedSize: MAX_TAR_BYTES + 1 }, { parts: Array(MAX_PARTS + 1).fill(part) }, { parts: [{ ...part, size: PART_BYTES + 1 }] }, { parts: [{ ...part, size: 3 }] }, { format: 'oci' } ]) assert.throws(() => validateArchive({ ...descriptor, ...changed }, image), /ARCHIVE_/)
})
test('immutable HEAD reuse sends neither bytes nor credentials in URL', async () => {
  const bytes = Buffer.from('part'), calls = []
  const result = await putPart(bytes, { ...options, fetcher: async (url, init) => { calls.push(init.method); assert.equal(url.pathname, `/v1/artifact-blobs/${hash(bytes).slice(7)}`); assert.equal(url.search, ''); assert.equal(init.headers.authorization, 'Bearer test-only-token'); assert.equal(init.redirect, 'error'); assert.ok(init.signal instanceof AbortSignal); return head(bytes) } })
  assert.deepEqual(calls, ['HEAD']); assert.deepEqual(result, part)
})
test('one upload attempt, exact receipt, response loss reconciles with HEAD', async () => {
  const bytes = Buffer.from('part')
  for (const outcome of ['receipt', 'lost-response', 'server-unknown', 'lost-body']) {
    const calls = []
    const result = await putPart(bytes, { ...options, fetcher: async (_url, init) => {
      calls.push(init.method)
      if (calls.length === 1) return new Response(null, { status: 404 })
      if (init.method === 'HEAD') return head(bytes)
      assert.deepEqual(init.body, bytes); assert.equal(init.headers['content-length'], '4')
      if (outcome === 'lost-response') throw new Error('socket lost')
      if (outcome === 'server-unknown') return new Response(null, { status: 502 })
      if (outcome === 'lost-body') return new Response('{')
      return Response.json({ ...part, complete: true })
    } })
    assert.deepEqual(result, part)
    assert.deepEqual(calls, outcome === 'receipt' ? ['HEAD', 'PUT'] : ['HEAD', 'PUT', 'HEAD'])
  }
})
test('auth and body conflict never retry; missing reconciliation never repeats PUT', async () => {
  for (const status of [401, 403]) {
    let calls = 0
    await assert.rejects(putPart(Buffer.from('part'), { ...options, fetcher: async () => { calls++; return new Response(null, { status }) } }), new RegExp(`ARCHIVE_HEAD_HTTP_${status}`))
    assert.equal(calls, 1)
  }
  for (const status of [400, 401, 403, 409]) {
    const methods = []
    await assert.rejects(putPart(Buffer.from('part'), { ...options, fetcher: async (_url, init) => { methods.push(init.method); return new Response(null, { status: init.method === 'HEAD' ? 404 : status }) } }), new RegExp(`ARCHIVE_PUT_HTTP_${status}`))
    assert.deepEqual(methods, ['HEAD', 'PUT'])
  }
  let writes = 0
  await assert.rejects(putPart(Buffer.from('part'), { ...options, fetcher: async (_url, init) => { if (init.method === 'PUT') { writes++; throw new Error('lost') } return new Response(null, { status: 404 }) } }), /ARCHIVE_PUT_UNCONFIRMED/)
  assert.equal(writes, 1)
  await assert.rejects(putPart(Buffer.from('part'), { ...options, fetcher: async () => head(Buffer.from('wrong')) }), /ARCHIVE_PART_CONFLICT/)
  let calls = 0
  await assert.rejects(putPart(Buffer.from('part'), { ...options, fetcher: async () => ++calls === 1 ? new Response(null, { status: 404 }) : Response.json({ ...part, sha256: hash('wrong'), complete: true }) }), /ARCHIVE_PART_CONFLICT/)
  assert.equal(calls, 2)
  for (const baseUrl of ['http://release.test', 'https://user:pass@release.test', 'https://release.test/prefix', 'https://release.test/?secret=x']) await assert.rejects(putPart(Buffer.from('part'), { ...options, baseUrl, fetcher: () => assert.fail('must not fetch') }))
})
test('streaming partition uses 8 MiB then exact tail, rehashes the complete archive', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lingxi-archive-parts-'))
  try {
    const bytes = Buffer.alloc(PART_BYTES + 23, 27), path = join(directory, 'archive.gz')
    await writeFile(path, bytes)
    const first = bytes.subarray(0, PART_BYTES), tail = bytes.subarray(PART_BYTES)
    const fetcher = async url => head(url.pathname.endsWith(hash(first).slice(7)) ? first : tail)
    const parts = await uploadParts(path, { size: bytes.length, sha256: hash(bytes) }, { ...options, fetcher })
    assert.deepEqual(parts, [{ sha256: hash(bytes.subarray(0, PART_BYTES)), size: PART_BYTES }, { sha256: hash(bytes.subarray(PART_BYTES)), size: 23 }])
    await assert.rejects(uploadParts(path, { size: bytes.length, sha256: hash('wrong') }, { ...options, fetcher }), /ARCHIVE_CHANGED_DURING_UPLOAD/)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

const fixtureScript = String.raw`
import gzip,hashlib,io,json,sys,tarfile
root,variant=sys.argv[1:]
layer=b'actual uncompressed layer bytes'
diff='sha256:'+hashlib.sha256(layer).hexdigest()
config=json.dumps({'os':'linux','architecture':'amd64','rootfs':{'type':'layers','diff_ids':[diff]}},separators=(',',':')).encode()
sha='sha256:'+hashlib.sha256(config).hexdigest()
tag='localhost/lingxi-release-cache:sha256-'+sha[7:]
manifest=[{'Config':sha[7:]+'.json','RepoTags':[tag], 'Layers':['layer/layer.tar']}]
if variant=='tag': manifest[0]['RepoTags'].append('attacker/image:latest')
if variant=='config': config+=b' '
if variant=='layer': layer+=b' changed'
if variant in ('compressed','oci-compressed'): layer=gzip.compress(layer)
if variant=='order': manifest[0]['Layers']=['missing/layer.tar']
if variant=='multi': manifest.append(manifest[0])
tar=io.BytesIO()
entries=[(sha[7:]+'.json',config),('layer/layer.tar',layer),('manifest.json',json.dumps(manifest).encode())]
if variant.startswith('oci'):
 blob_layer=layer+b'changed' if variant=='oci-layer' else layer
 layer_sha='sha256:'+hashlib.sha256(blob_layer).hexdigest()
 oci={'schemaVersion':2,'config':{'digest':sha if variant!='oci-config' else 'sha256:'+'a'*64,'size':len(config)},'layers':[{'digest':layer_sha,'size':len(blob_layer)}]}
 oci_bytes=json.dumps(oci).encode();oci_sha='sha256:'+hashlib.sha256(oci_bytes).hexdigest()
 index={'schemaVersion':2,'manifests':[{'digest':oci_sha,'size':len(oci_bytes),'annotations':{'io.containerd.image.name':tag}}]}
 if variant=='oci-multi':index['manifests'].append(index['manifests'][0])
 if variant=='oci-tag':index['manifests'][0]['annotations']['io.containerd.image.name']='other/image:latest'
 entries.extend([('blobs/sha256/'+sha[7:],config),('blobs/sha256/'+layer_sha[7:],blob_layer),('blobs/sha256/'+oci_sha[7:],oci_bytes),('index.json',json.dumps(index).encode())])
with tarfile.open(fileobj=tar,mode='w') as t:
 for name,data in entries:
  item=tarfile.TarInfo(name);item.size=len(data);t.addfile(item,io.BytesIO(data))
 if variant=='path':
  item=tarfile.TarInfo('../escape');item.size=1;t.addfile(item,io.BytesIO(b'x'))
 if variant=='link':
  item=tarfile.TarInfo('link');item.type=tarfile.SYMTYPE;item.linkname='/etc/passwd';t.addfile(item)
raw=tar.getvalue()
if variant=='trailing':raw+=b'nonzero trailing data'
compressed=gzip.compress(raw)
open(root+'/image.tar.gz','wb').write(compressed)
print(json.dumps({'image':{'os':'linux','architecture':'amd64','configDigest':sha,'diffIds':[diff]},'descriptor':{'sha256':'sha256:'+hashlib.sha256(compressed).hexdigest(),'size':len(compressed),'uncompressedSize':len(raw),'tag':tag}}))
`
test('saved archive verifies actual raw config and ordered layer hashes; rejects extra tags, unsafe members and data changes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lingxi-archive-verify-'))
  try {
    for (const variant of ['valid', 'compressed', 'oci', 'oci-compressed', 'oci-config', 'oci-layer', 'oci-multi', 'oci-tag', 'tag', 'config', 'layer', 'order', 'multi', 'path', 'link', 'trailing']) {
      const fixture = JSON.parse(execFileSync('python3', ['-c', fixtureScript, directory, variant], { encoding: 'utf8' }))
      if (['valid', 'compressed', 'oci', 'oci-compressed'].includes(variant)) assert.deepEqual(verifySavedArchive(join(directory, 'image.tar.gz'), fixture.image, fixture.descriptor).diffIds, fixture.image.diffIds)
      else assert.throws(() => verifySavedArchive(join(directory, 'image.tar.gz'), fixture.image, fixture.descriptor), /ARCHIVE_/)
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
})
test('raw source proof is required before pulling or saving', async () => {
  await assert.rejects(verifySource({ ...image, ref: `ghcr.io/example/runtime@${hash('index')}` }), /ARCHIVE_OCI_PROOF_REQUIRED/)
  await assert.rejects(verifySource({ ...image, ref: 'https://arbitrary.example/image' }), /ARCHIVE_SOURCE_INVALID/)
  const config = Buffer.from(JSON.stringify({ os: 'linux', architecture: 'amd64', rootfs: { type: 'layers', diff_ids: [hash('actual layer')] } }))
  const manifest = Buffer.from(JSON.stringify({ schemaVersion: 2, config: { digest: hash(config), size: config.length }, layers: [] }))
  const index = Buffer.from(JSON.stringify({ schemaVersion: 2, manifests: [{ digest: hash(manifest), size: manifest.length, platform: { os: 'linux', architecture: 'amd64' } }] }))
  const source = { kind: 'image', ref: `ghcr.io/example/runtime@${hash(index)}`, digest: hash(index), indexDigest: hash(index), platformDigest: hash(manifest), configDigest: hash(config), os: 'linux', architecture: 'amd64', diffIds: [hash('actual layer')], ociProof: { index: index.toString('base64'), manifest: manifest.toString('base64'), config: config.toString('base64') } }
  await verifySource(source)
  await assert.rejects(verifySource({ ...source, configDigest: hash('wrong config') }), /ARCHIVE_SOURCE_MISMATCH/)
  await assert.rejects(verifySource({ ...source, ociProof: { ...source.ociProof, config: Buffer.from('wrong bytes').toString('base64') } }), /OCI_DIGEST_MISMATCH/)
})
test('archive staging permits configured publish-only bootstrap while candidate registration stays disabled', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8')
  const step = workflow.slice(workflow.indexOf('        name: Record registry index'), workflow.indexOf('  update-manifests:'))
  const guard = "vars.RELEASE_CONTROLLER_ENABLED == 'true' || (github.ref == 'refs/heads/main' && inputs.publish_only && vars.RELEASE_API_URL != '')"
  assert.ok(workflow.slice(0, workflow.indexOf('        name: Record registry index')).endsWith(`      - if: ${guard}\n`))
  assert.ok(step.includes(`      - if: ${guard}\n        uses: actions/upload-artifact@v4`))
  assert.match(step, /node scripts\/release\/image-archive.mjs "release-artifacts\/\$COMPONENT\/artifact.json"/)
  assert.match(step, /path: release-artifacts\//)
  assert.doesNotMatch(step, /path:.*RUNNER_TEMP|RELEASE_ADMIN_TOKEN|EXECUTOR_TOKEN/)
  const registration = workflow.slice(workflow.indexOf('  register-candidate:'), workflow.indexOf('  report-release:'))
  assert.match(registration, /!inputs\.publish_only/)
  assert.match(registration, /vars\.RELEASE_CONTROLLER_ENABLED == 'true'/)
})

// Opt in explicitly: a local Unix socket with no production DOCKER_HOST.
test('real isolated local Docker save round trip preserves actual config and layer bytes', { skip: process.env.LINGXI_ARCHIVE_REAL_DOCKER !== '1' }, async () => {
  const prefix = ['--host', 'unix:///var/run/docker.sock']
  const docker = (args, input) => execFileSync('docker', [...prefix, ...args], { input, encoding: input ? undefined : 'utf8', timeout: 120000, stdio: ['pipe', 'pipe', 'pipe'] })
  const directory = await mkdtemp(join(tmpdir(), 'lingxi-real-docker-save-'))
  const fixtureTag = `localhost/lingxi-release-fixture:test-${process.pid}-${Date.now()}`
  let safeTag, imported = false
  try {
    const tar = execFileSync('python3', ['-c', 'import io,sys,tarfile\nb=io.BytesIO()\nwith tarfile.open(fileobj=b,mode="w") as t:\n d=b"isolated real Docker archive fixture";i=tarfile.TarInfo("fixture.txt");i.size=len(d);t.addfile(i,io.BytesIO(d))\nsys.stdout.buffer.write(b.getvalue())'])
    docker(['image', 'import', '--platform', 'linux/amd64', '-', fixtureTag], tar); imported = true
    const actual = JSON.parse(docker(['image', 'inspect', fixtureTag]))[0]
    const image = { configDigest: actual.Id, diffIds: actual.RootFS.Layers, os: actual.Os, architecture: actual.Architecture }
    safeTag = archiveTag(image); docker(['image', 'tag', fixtureTag, safeTag])
    const path = join(directory, 'image.tar.gz'), descriptor = await gzipDockerSave(safeTag, path, { dockerPrefix: prefix })
    const receipt = verifySavedArchive(path, image, descriptor)
    assert.equal(receipt.configDigest, actual.Id); assert.deepEqual(receipt.diffIds, actual.RootFS.Layers)
    const bytes = await readFile(path)
    const parts = await uploadParts(path, descriptor, { ...options, fetcher: async () => head(bytes) })
    validateArchive({ version: 1, format: 'docker-save+gzip', ...descriptor, parts }, image)
    console.log(`Real isolated Docker ${docker(['version', '--format', '{{.Server.Version}}']).trim()}: docker import/tag/save; config and ordered layer bytes verified; no container or registry access`)
  } finally {
    if (safeTag) docker(['image', 'rm', safeTag])
    if (imported) docker(['image', 'rm', fixtureTag])
    await rm(directory, { recursive: true, force: true })
  }
})
