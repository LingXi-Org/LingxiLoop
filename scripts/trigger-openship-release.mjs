import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'

const imageNames = ['server', 'agent-os', 'wukongim', 'open-notebook', 'gateway']

export function deploymentImages(source) {
  return Object.fromEntries(imageNames.map((name) => {
    const image = source.match(new RegExp(`image:\\s*(\\S*lingxiloop-${name}:[0-9a-f]{40})`))?.[1]
    if (!image) throw new Error(`missing deployed image: ${name}`)
    return [name, image]
  }))
}

export function buildReleaseRequest(secret, commitSha, deployCommitSha, repository, imageDigests) {
  if (!secret || !/^[0-9a-f]{40}$/.test(commitSha) || !/^[0-9a-f]{40}$/.test(deployCommitSha) || !/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('invalid release configuration')
  if (imageNames.some((name) => !new RegExp(`lingxiloop-${name}:[0-9a-f]{40}$`).test(imageDigests[name] ?? ''))) throw new Error('invalid release images')
  const body = JSON.stringify({ commitSha, deployCommitSha, imageDigests })
  return { body, signature: createHmac('sha256', secret).update(body).digest('base64url') }
}

if (process.argv[1]?.endsWith('trigger-openship-release.mjs')) {
  const manifests = ['app-a.yml', 'app-b.yml', 'agent-os.yml', 'core-state.yml', 'knowledge-agent.yml']
    .map((name) => readFileSync(new URL(`../deploy/openship/${name}`, import.meta.url), 'utf8')).join('\n')
  const { body, signature } = buildReleaseRequest(
    process.env.RELEASE_HMAC_SECRET,
    process.env.RELEASE_COMMIT_SHA ?? '',
    process.env.RELEASE_DEPLOY_COMMIT_SHA ?? '',
    process.env.RELEASE_REPOSITORY ?? '',
    deploymentImages(manifests),
  )
  const response = await fetch('https://admin.lingxilearn.cn/api/internal/releases', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-release-signature': signature }, body, signal: AbortSignal.timeout(30_000),
  })
  const result = await response.text()
  console.log(result)
  if (!response.ok) process.exitCode = 1
}
