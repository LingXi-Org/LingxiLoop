// Secret URL is injected into this process by Sigillo; never an argument or log.
import { parseDocument } from 'yaml'
import { readFile, writeFile, mkdir, mkdtemp, rename, rm, lstat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
const MAX = 2 * 1024 * 1024
const fail = message => { throw Error(message) }
export function importNodes(text) {
  if (Buffer.byteLength(text) > MAX) fail('Subscription exceeds size limit')
  const doc = parseDocument(text, { uniqueKeys: true, maxAliasCount: 0 })
  if (doc.errors.length) fail('Subscription YAML is invalid')
  let input
  try { input = doc.toJS({ maxAliasCount: 0 }) } catch { fail('Subscription aliases are forbidden') }
  if (!input || !Array.isArray(input.proxies) || !input.proxies.length || input.proxies.length > 1000) fail('Non-empty proxy list required')
  const names = new Set()
  const allowed = new Set(['name','type','server','port','password','username','cipher','uuid','alterId','udp','tls','servername','sni','alpn','client-fingerprint','network','ws-opts','grpc-opts','reality-opts','flow','packet-encoding','obfs','obfs-password','up','down','auth','auth-str','protocol','protocol-param','obfs-param'])
  const types = new Set(['ss','ssr','vmess','vless','trojan','hysteria','hysteria2','tuic','http','socks5'])
  const proxies = input.proxies.map(node => {
    if (!node || typeof node !== 'object' || Array.isArray(node) || Object.keys(node).some(k => !allowed.has(k))) fail('Unsupported proxy property')
    if (typeof node.name !== 'string' || !node.name.trim() || node.name.length > 128 || /[\r\n\0]/.test(node.name) || names.has(node.name) || ['DIRECT','REJECT','REGISTRY'].includes(node.name)) fail('Invalid or duplicate proxy name')
    names.add(node.name)
    if (!types.has(node.type) || typeof node.server !== 'string' || !/^[a-zA-Z0-9.:-]+$/.test(node.server) || !Number.isInteger(node.port) || node.port < 1 || node.port > 65535) fail('Invalid proxy endpoint')
    return node
  })
  // Imported controller/listener/DNS/rules/providers/scripts are discarded.
  return { proxies }
}
export function subscriptionURL(value, allowedOrigin) {
  let url, origin
  try { url = new URL(value); origin = new URL(allowedOrigin) } catch { fail('Secret URL and approved origin required') }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.origin !== origin.origin || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) fail('Subscription origin is not approved HTTPS')
  return url
}
export async function promote({ directory, nodes, validate }) {
  directory = resolve(directory)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const stat = await lstat(directory)
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077)) fail('Private state directory (0700) required')
  const stage = await mkdtemp(join(directory, '.candidate-'))
  try {
    const config = JSON.parse(await readFile(new URL('../../deploy/mihomo/config.json', import.meta.url), 'utf8'))
    await writeFile(join(stage, 'config.json'), JSON.stringify(config), { mode: 0o600 })
    await writeFile(join(stage, 'provider.json'), JSON.stringify(nodes), { mode: 0o600 })
    await validate(stage)
    // One atomic replacement; a failed refresh leaves the last validated provider intact.
    await rename(join(stage, 'config.json'), join(directory, 'config.json'))
    await rename(join(stage, 'provider.json'), join(directory, 'provider.json'))
  } finally { await rm(stage, { recursive: true, force: true }) }
}
export async function refresh(env = process.env) {
  const url = subscriptionURL(env.MIHOMO_SUBSCRIPTION_URL, env.MIHOMO_SUBSCRIPTION_ORIGIN)
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20000) })
  if (!response.ok) fail('Subscription fetch failed')
  let length = 0; const chunks = []
  for await (const chunk of response.body) { length += chunk.length; if (length > MAX) fail('Subscription exceeds size limit'); chunks.push(chunk) }
  const nodes = importNodes(Buffer.concat(chunks).toString('utf8'))
  if (!env.MIHOMO_STATE_DIR || !env.MIHOMO_BINARY?.startsWith('/')) fail('Private state directory and absolute Mihomo binary required')
  await promote({ directory: env.MIHOMO_STATE_DIR, nodes, validate: async directory => {
    const result = spawnSync(env.MIHOMO_BINARY, ['-t','-d',directory,'-f',join(directory,'config.json')], { stdio: 'ignore', timeout: 20000, env: { PATH: process.env.PATH } })
    if (result.status !== 0 || result.error) fail('Mihomo validation failed')
  } })
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  refresh().then(() => console.log('Provider validated and saved; daemon activation and network verification remain separate.')).catch(() => { console.error('Refresh failed; last validated provider retained. Check subscription, private directory, binary and schema.'); process.exitCode = 1 })
}
