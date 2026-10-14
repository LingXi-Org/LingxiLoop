import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

// Transfer reviewed configuration through the existing authenticated Komodo API.
// Only the configuration hash is logged; variable values remain in Komodo.
export async function syncKomodoConfig({ url, headers, source }) {
  source ??= await readFile(new URL('../deploy/komodo/resources.toml', import.meta.url), 'utf8')
  if (!source.includes('[[stack]]') || !source.includes('[[procedure]]')) throw new Error('Invalid production resource source')
  async function request(path, body) {
    const response = await fetch(new URL(path, url), {
      method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000),
    })
    if (!response.ok) throw new Error(`Komodo configuration request returned ${response.status}`)
    return response.json()
  }
  const name = 'lingxiloop-production'
  const previous = await request('/read/GetResourceSync', { sync: name })
  const id = previous._id?.$oid ?? previous.id
  if (!id) throw new Error('Production resource sync has no ID')
  await request('/write/UpdateResourceSync', {
    id, config: { repo: '', linked_repo: '', files_on_host: false, file_contents: source },
  })
  const stored = await request('/read/GetResourceSync', { sync: name })
  if (stored.config.file_contents !== source || stored.config.repo || stored.config.linked_repo || stored.config.files_on_host) {
    throw new Error('Stored production configuration does not match the release')
  }
  const preview = await request('/write/RefreshResourceSyncPending', { sync: name })
  if (!preview.info || preview.info.pending_error || preview.info.pending_deploy_error || preview.info.remote_errors?.length) {
    throw new Error('Production configuration preview failed; services remain running')
  }
  const hash = createHash('sha256').update(source).digest('hex')
  console.log(`[komodo-config] source sha256=${hash}; preview verified`)
}
