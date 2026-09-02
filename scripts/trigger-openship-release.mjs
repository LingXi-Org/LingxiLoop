import { createHmac } from 'node:crypto'

export function buildReleaseRequest(secret, commitSha, deployCommitSha, repository) {
  if (!secret || !/^[0-9a-f]{40}$/.test(commitSha) || !/^[0-9a-f]{40}$/.test(deployCommitSha) || !/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('invalid release configuration')
  const owner = repository.split('/')[0].toLowerCase()
  const imageDigests = Object.fromEntries(['server', 'agent-os', 'wukongim', 'open-notebook', 'gateway'].map((name) => [name, `accel.way2api.fun/ghcr.io/${owner}/lingxiloop-${name}:${commitSha}`]))
  const body = JSON.stringify({ commitSha, deployCommitSha, imageDigests })
  return { body, signature: createHmac('sha256', secret).update(body).digest('base64url') }
}

if (process.argv[1]?.endsWith('trigger-openship-release.mjs')) {
  const { body, signature } = buildReleaseRequest(process.env.RELEASE_HMAC_SECRET, process.env.RELEASE_COMMIT_SHA ?? '', process.env.RELEASE_DEPLOY_COMMIT_SHA ?? '', process.env.RELEASE_REPOSITORY ?? '')
  const response = await fetch('https://admin.lingxilearn.cn/api/internal/releases', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-release-signature': signature }, body, signal: AbortSignal.timeout(30_000),
  })
  const result = await response.text()
  console.log(result)
  if (!response.ok) process.exitCode = 1
}
