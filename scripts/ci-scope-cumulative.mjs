import { execFileSync } from 'node:child_process'
import { writeFileSync, appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { classifyPaths } from './ci-scope-paths.mjs'
import { computeScope } from './ci-scope.mjs'

export const componentFields = {
  'main-frontend': ['web', 'webTests', 'webTestsFiles', 'sharedFrontend', 'release'],
  'main-runtime-a': ['serverSource', 'serverSourceFiles', 'server', 'serverTests', 'serverTestsFiles', 'serverDocker', 'sharedFrontend', 'release', 'deployment', 'integrationRunner', 'integrationRunnerFiles', 'integrationTests', 'integrationFiles'],
  'main-runtime-b': ['serverSource', 'serverSourceFiles', 'server', 'serverTests', 'serverTestsFiles', 'serverDocker', 'sharedFrontend', 'release', 'deployment', 'integrationRunner', 'integrationRunnerFiles', 'integrationTests', 'integrationFiles'],
  'notebook': ['openNotebook', 'openNotebookTests', 'release'],
  'wukongim': ['wukongim', 'release'], 'gateway': ['gateway', 'release'],
  'admin-worker': ['admin', 'adminTests', 'adminTestsFiles', 'control', 'controlTests', 'controlMigrations', 'sharedFrontend'],
}
export function cumulativeChanges(accepted, targetSha, git = args => execFileSync('git', args, { encoding: 'utf8' }).trim(), classify = classifyPaths) {
  if (!accepted?.releaseId || !accepted.components || Object.keys(componentFields).some(id => !accepted.components[id]?.appSha)) throw new Error('ACCEPTED_BASELINE_REQUIRED: import verified production component identities before enabling CI')
  const result = {}; const differences = {}
  for (const [id, fields] of Object.entries(componentFields)) {
    const sha = accepted.components[id].appSha
    if (!/^[a-f0-9]{40}$/.test(sha) || !/^[a-f0-9]{40}$/.test(targetSha)) throw new Error('Invalid exact component commit')
    // A rewritten or unrelated source history must be reconciled by an operator.
    git(['merge-base', '--is-ancestor', sha, targetSha])
    const files = git(['diff', '--name-only', '--diff-filter=ACDMRT', `${sha}..${targetSha}`]).split('\n').filter(Boolean)
    differences[id] = { fromSha: sha, files }
    const changed = classify(files)
    for (const field of fields) {
      if (Array.isArray(changed[field])) result[field] = [...new Set([...(result[field] || []), ...changed[field]])]
      else if (changed[field]) result[field] = true
    }
    for (const key of ['ci', 'lintConfig', 'testRunner']) if (changed[key]) result[key] = true
  }
  return { changed: result, differences }
}
export function releaseApiUrl(baseUrl, path, token) {
  if (!token) throw new Error('RELEASE_API_TOKEN is required')
  const base = new URL(baseUrl)
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('release API requires an independent HTTPS root URL without credentials')
  return new URL(path, base)
}
export async function readAccepted(baseUrl, token, fetcher = fetch) {
  const response = await fetcher(releaseApiUrl(baseUrl, '/v1/accepted', token), { headers: { authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`accepted baseline lookup failed: HTTP ${response.status}`)
  return response.json()
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const accepted = await readAccepted(process.env.RELEASE_API_URL, process.env.RELEASE_API_TOKEN)
  const { changed, differences } = cumulativeChanges(accepted, process.env.GITHUB_SHA)
  // A manual narrow scope cannot discard changes accumulated since acceptance.
  const scope = computeScope(changed, '', { releaseController: true })
  scope.web_tests = JSON.stringify(changed.webTestsFiles || [])
  scope.admin_tests = JSON.stringify(changed.adminTestsFiles || [])
  scope.server_tests = JSON.stringify(changed.serverTestsFiles || [])
  writeFileSync('accepted-baseline.json', JSON.stringify(accepted))
  writeFileSync('release-scope.json', JSON.stringify({ scope, differences }))
  appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(scope).map(([name, value]) => `${name}=${name === 'images' || name === 'check_jobs' ? JSON.stringify({ include: value }) : Array.isArray(value) ? JSON.stringify(value) : value}`).join('\n') + '\n')
}
