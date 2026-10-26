import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { putImmutableObject, retainGroups } from './release/static-transfer.mjs'
export { putImmutableObject } from './release/static-transfer.mjs'
import { immutable } from '../workers/web-static/src/index.mjs'
const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
function walk(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]) }
export function inventory(directory, sources = []) {
  return [...walk(directory).map(file => ({ path: relative(directory, file).replaceAll('\\', '/'), source: file })), ...sources.map(file => ({ path: `@worker/${relative(process.cwd(), file).replaceAll('\\', '/')}`, source: file }))].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0).map(({ path, source }) => ({ path, hash: hash(readFileSync(source)), bytes: readFileSync(source).length }))
}
export function parseVersion(log) {
  const matches = [...log.matchAll(/(?:Worker Version ID|Version ID|Uploaded Version)[^\n]*?([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/gi)].map(match => match[1])
  if (new Set(matches).size !== 1) throw new Error('Expected one uploaded Worker version identity')
  return matches[0]
}
export function effectiveWorkerVariables(id, env = process.env) {
  const values = { BACKEND_ORIGIN_BASE_URL: env.BACKEND_ORIGIN_BASE_URL, AUTH_ORIGIN_BASE_URL: env.AUTH_ORIGIN_BASE_URL }
  const httpsRoot = value => {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash } catch { return false }
  }
  if (!Object.values(values).every(httpsRoot)) throw new Error('independent HTTPS origins are required')
  if (id === 'admin-worker') {
    if (env.RELEASE_CONTROLLER_ENABLED !== 'true' || !httpsRoot(env.RELEASE_API_URL)) throw new Error('release controller configuration requires an enabled guard and HTTPS API origin')
    Object.assign(values, { RELEASE_API_URL: env.RELEASE_API_URL, RELEASE_CONTROLLER_ENABLED: env.RELEASE_CONTROLLER_ENABLED })
  }
  return values
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const [command, id, directory, config] = process.argv.slice(2)
  const output = `release-artifacts/${id}`
  mkdirSync(output, { recursive: true })
  if (command === 'inventory') {
    mkdirSync(`${directory}/licenses`, { recursive: true })
    for (const [source, name] of [['third_party/assistant-ui/streaming-text/LICENSE', 'assistant-ui-streaming-text.txt'], ['third_party/assistant-ui-elements/LICENSE', 'assistant-ui-elements.txt'], ['third_party/react-chat-elements/reply-message/LICENSE', 'react-chat-elements-reply-message.txt']]) copyFileSync(source, `${directory}/licenses/${name}`)
    const workerFiles = walk(resolve(config, '..', 'src')).filter(file => !file.includes('.test.'))
    const files = inventory(directory, [config, 'server/build/admin-control/package-lock.json', ...workerFiles])
    const effectiveVars = effectiveWorkerVariables(id)
    files.push({ path: '@effective-vars', hash: hash(JSON.stringify(effectiveVars)), bytes: Buffer.byteLength(JSON.stringify(effectiveVars)) })
    writeFileSync(`${output}/inventory.json`, JSON.stringify({ files, hash: hash(JSON.stringify(files)), configurationVersion: `cfg-${hash(JSON.stringify({ config: hash(readFileSync(config)), effectiveVars })).slice(7, 31)}` }, null, 2))
    if (id === 'main-frontend') {
      if(!process.env.RELEASE_API_URL||!process.env.RELEASE_API_TOKEN)throw new Error('EXISTING_RETAINED_API_CONFIGURATION_REQUIRED')
      const options = { account: process.env.CLOUDFLARE_ACCOUNT_ID, bucket: process.env.RELEASE_ARTIFACT_BUCKET || 'lingxiloop-releases', token: process.env.CLOUDFLARE_API_TOKEN,retainedApiBase:process.env.RELEASE_API_URL,retainedApiToken:process.env.RELEASE_API_TOKEN }
      // Never prune old chunks during release. Retirement requires an explicit
      // controller GC after both accepted and recovery windows expire.
      const objects = files.filter(file => immutable.test(`/${file.path}`)).map(file => {
        const extension = file.path.split('.').at(-1)
        const contentType = { js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', json: 'application/json', woff2: 'font/woff2' }[extension] || 'application/octet-stream'
        return { key: `chunks/${file.path}`, sha256:file.hash, size:file.bytes, bytes: () => readFileSync(resolve(directory, file.path)), contentType }
      })
      const receipt = await retainGroups(objects, options)
      writeFileSync(`${output}/transfer.json`, JSON.stringify(receipt, null, 2))
      console.log(JSON.stringify({ stage: 'retained-chunks', ...receipt, results: undefined }))
      if (receipt.status !== 'complete') throw new Error('STATIC_TRANSFER_INCOMPLETE: inspect transfer.json')
    }
  } else if (command === 'record') {
    const { hash: artifactHash, configurationVersion } = JSON.parse(readFileSync(`${output}/inventory.json`, 'utf8'))
    const versionId = parseVersion(readFileSync(directory, 'utf8'))
    // name is supplied explicitly by CI, not extracted from untrusted logs.
    if (!/^[a-z][a-z0-9-]+$/.test(config)) throw new Error('invalid Worker name')
    const artifact = JSON.stringify({ kind: 'worker', workerName: config, versionId, hash: artifactHash, configurationVersion })
    writeFileSync(`${output}/artifact.json`, artifact)
    const releaseId = `gh-${process.env.GITHUB_RUN_ID}-a${process.env.GITHUB_RUN_ATTEMPT || 1}-${process.env.GITHUB_SHA?.slice(0, 12)}`
    if (!/^gh-\d+-a\d+-[a-f0-9]{12}$/.test(releaseId)) throw new Error('exact CI release identity required')
    const options = { account: process.env.CLOUDFLARE_ACCOUNT_ID, bucket: process.env.RELEASE_ARTIFACT_BUCKET || 'lingxiloop-releases', token: process.env.CLOUDFLARE_API_TOKEN, contentType: 'application/json' }
    await putImmutableObject(`releases/${releaseId}/${id}/inventory.json`, readFileSync(`${output}/inventory.json`), options)
    await putImmutableObject(`releases/${releaseId}/${id}/artifact.json`, Buffer.from(artifact), options)
  } else throw new Error('Expected inventory or record')
}
