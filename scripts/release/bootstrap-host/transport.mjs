import { buildInstallCommand, buildInstallQueryCommand, buildPublicKeyCommand, buildCredentialCommand, buildCredentialQueryCommand, buildPolicyCommand, buildInventoryCommand, buildRuntimeMetadataCommand, buildTunnelCommand, buildBackendRouteCommand } from './index.mjs'

const servers = { a: 'shanghai-a', b: 'shanghai-b' }
const builders = { install: buildInstallCommand, 'query-install': buildInstallQueryCommand, 'public-key': buildPublicKeyCommand,
  credentials: buildCredentialCommand, 'query-credentials': buildCredentialQueryCommand, policy: buildPolicyCommand, inventory: buildInventoryCommand, 'runtime-metadata': buildRuntimeMetadataCommand, tunnel: buildTunnelCommand, 'backend-route': buildBackendRouteCommand }
const quote = text => `'${text.replaceAll("'", "'\\''")}'`
// Operator bootstrap only, through the existing administrative transport. The
// new executor exposes its finite release protocol, never this terminal API.
export async function executeBootstrap(side, action, input, { fetcher = fetch, timeoutMs = 180000 } = {}) {
  if (!servers[side] || !builders[action]) throw new Error('INVALID_BOOTSTRAP_ACTION')
  if (!process.env.KOMODO_API_KEY || !process.env.KOMODO_API_SECRET) throw new Error('EXISTING_OPERATOR_CREDENTIAL_REQUIRED')
  // Different actions have separate terminal streams; a remote kernel lock
  // also serializes their filesystem effects across operator processes.
  const readTunnel = action === 'tunnel' && input?.action === 'query'
  const command = readTunnel ? `set +x; umask 077; ${builders[action](input)}` : `set +x; umask 077; mkdir -p -m 0700 /run/lingxi-release-bootstrap-495; /usr/bin/flock --exclusive --timeout 120 /run/lingxi-release-bootstrap-495/operator.lock /bin/bash -c ${quote(builders[action](input))}`
  const stream = ['tunnel','backend-route'].includes(action) ? `${action}-${input.action}` : action
  let response
  try {
    response = await fetcher('https://ops.christmas1314.xyz/terminal/execute', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.KOMODO_API_KEY, 'x-api-secret': process.env.KOMODO_API_SECRET },
      body: JSON.stringify({ target: { type: 'Server', params: { server: servers[side] } }, terminal: `issue-495-bootstrap-${side}-${stream}`, command, init: { command: 'bash', recreate: 'Never' } }),
    })
  } catch { throw Object.assign(new Error('BOOTSTRAP_OUTCOME_UNKNOWN_QUERY_BEFORE_RETRY'), { uncertain: true, side, action }) }
  if (!response.ok) { await response.body?.cancel(); throw Object.assign(new Error(`BOOTSTRAP_HTTP_${response.status}`), { status: response.status, side, action }) }
  const chunks = []; let bytes = 0
  try {
    for await (const chunk of response.body) { bytes += chunk.length; if (bytes > 2_000_000) throw Error('OUTPUT_LIMIT'); chunks.push(chunk) }
  } catch { throw Object.assign(new Error('BOOTSTRAP_STREAM_OUTCOME_UNKNOWN'), { uncertain: true, side, action }) }
  const output = Buffer.concat(chunks).toString('utf8')
  const json = output.split(/\r?\n/).map(line => line.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim()).filter(line => line.startsWith('{') && line.endsWith('}')).flatMap(line => { try { return [JSON.parse(line)] } catch { return [] } })
  if (json.length !== 1) throw Object.assign(new Error('BOOTSTRAP_RECEIPT_UNCONFIRMED'), { uncertain: true, side, action })
  return { side, action, status: response.status, receipt: json[0] }
}
