import { readFileSync, writeFileSync } from 'node:fs'

const manifests = {
  'deploy/openship/app.yml': ['server', 'gateway'],
  'deploy/openship/agent-os.yml': ['agent-os'],
  'deploy/openship/core-state.yml': ['wukongim'],
  'deploy/openship/knowledge-agent.yml': ['open-notebook'],
  'docker-compose.production.yml': ['server', 'open-notebook', 'wukongim', 'agent-os'],
  'docker-compose.mvp.yml': ['server', 'open-notebook', 'wukongim', 'agent-os'],
  'docker-compose.dokploy.yml': ['server', 'open-notebook', 'wukongim', 'agent-os'],
}

export function updateImageTags(source, sha, packages) {
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`invalid commit SHA: ${sha}`)
  let updated = source
  for (const name of packages) {
    const pattern = new RegExp(`(lingxiloop-${name}:)[0-9a-f]{40}`, 'g')
    if (!pattern.test(updated)) throw new Error(`missing lingxiloop-${name} image`)
    updated = updated.replace(pattern, `$1${sha}`)
  }
  return updated
}

if (process.argv[1]?.endsWith('update-deployment-images.mjs')) {
  const sha = process.argv[2] ?? ''
  const published = new Set(process.argv.slice(3))
  if (published.size === 0) throw new Error('at least one published package is required')
  for (const [path, packages] of Object.entries(manifests)) {
    const selected = packages.filter((name) => published.has(name))
    if (selected.length === 0) continue
    const source = readFileSync(path, 'utf8')
    writeFileSync(path, updateImageTags(source, sha, selected))
  }
}
