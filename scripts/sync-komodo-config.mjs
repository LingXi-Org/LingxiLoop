import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

// Transfer reviewed configuration through the existing authenticated Komodo API.
// Only the configuration hash is logged; variable values remain in Komodo.
export function refuseLegacyRollout() {
  throw new Error('Legacy Komodo publication is retired; use the release controller. Re-enabling requires a serialized ownership rollback.')
}
export async function syncKomodoConfig({ url, headers, source, fetcher = fetch }) {
  const reviewed = await readFile(new URL('../deploy/komodo/shared-resources.toml', import.meta.url), 'utf8')
  source ??= reviewed
  if (source !== reviewed) throw new Error('Only the reviewed shared Komodo scope is permitted; legacy stack/Procedure adoption is blocked')
  async function request(path, body) {
    const response = await fetcher(new URL(path, url), {
      method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000),
    })
    if (!response.ok) throw new Error(`Komodo configuration request returned ${response.status}`)
    return response.json()
  }
  const name = 'lingxiloop-production'
  const previous = await request('/read/GetResourceSync', { sync: name })
  const id = previous._id?.$oid ?? previous.id
  if (!id) throw new Error('Production resource sync has no ID')
  if (previous.config.managed !== false || previous.config.delete !== false) throw new Error('Shared scope requires confirmed managed=false and delete=false; no configuration was written')
  const allowed = new Set()
  for (const stack of ['server-b-ingress','landing','lingxilit','uptime']) {
    const stored = await request('/read/GetStack', { stack })
    const stackId = stored._id?.$oid ?? stored.id
    if (stored.name !== stack || !stackId) throw new Error('Existing shared stack identity is unconfirmed; no configuration was written')
    allowed.add(stackId)
  }
  await request('/write/UpdateResourceSync', {
    id, config: { repo: '', linked_repo: '', files_on_host: false, file_contents: source,
      resource_path: ['deploy/komodo/shared-resources.toml'], managed: false, delete: false, webhook_enabled: false },
  })
  const stored = await request('/read/GetResourceSync', { sync: name })
  if (stored.config.file_contents !== source || stored.config.repo || stored.config.linked_repo || stored.config.files_on_host ||
    stored.config.managed !== false || stored.config.delete !== false || stored.config.webhook_enabled !== false ||
    JSON.stringify(stored.config.resource_path) !== JSON.stringify(['deploy/komodo/shared-resources.toml'])) {
    throw new Error('Stored production configuration does not match the release')
  }
  const preview = await request('/write/RefreshResourceSyncPending', { sync: name })
  if (!preview.info || preview.info.pending_error || preview.info.pending_deploy_error || preview.info.remote_errors?.length) {
    throw new Error('Production configuration preview failed; services remain running')
  }
  for (const change of [...(preview.info.resource_updates ?? []),...(preview.info.pending_deploys ?? [])]) {
    if (change.target?.type !== 'Stack' || !allowed.has(change.target.id) || ['Create','Delete'].includes(change.data?.type)) {
      throw new Error('Shared scope preview includes an unowned or destructive target; do not execute RunSync')
    }
  }
  const hash = createHash('sha256').update(source).digest('hex')
  console.log(`[komodo-config] source sha256=${hash}; preview verified`)
}
