import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash'
const repo = 'accel.way2api.fun/ghcr.io/lingxi-org/lingxiloop-server'
const fixture = `
docker() {
  case "$*" in
    'ps -aq') echo container ;;
    'inspect --format {{.Image}} container') echo sha256:used ;;
    'image ls --no-trunc --format {{.Repository}}|{{.Tag}}|{{.ID}}') printf '%s\\n' "$INVENTORY" ;;
    'image rm '*) echo "$*" ;;
    *) echo "unexpected docker command: $*" >&2; return 1 ;;
  esac
}
source deploy/image-cleanup.sh "$@"
`

test('cleanup preserves containers, newest two versions, target and unrelated images', () => {
  const rows = [
    `${repo}|newest|sha256:newest`, `${repo}|previous|sha256:previous`,
    `${repo}|target|sha256:target`, `${repo}|running|sha256:used`,
    `${repo}|obsolete|sha256:obsolete`, `${repo}|<none>|sha256:dangling`,
    'ghcr.io/lingxi-org/lingxiloop-server|old|sha256:old-direct',
    'ghcr.io/lyyzka/lingxilit|old|sha256:unrelated',
    'postgres|old|sha256:database',
  ]
  const result = spawnSync(bash, ['-c', fixture, 'test', `${repo}:target`], {
    cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8',
    env: { ...process.env, INVENTORY: rows.join('\n') },
  })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(result.stdout.trim().split('\n'), [
    `image rm ${repo}:obsolete`, 'image rm sha256:dangling',
    'image rm ghcr.io/lingxi-org/lingxiloop-server:old',
  ])
})

test('inventory errors abort before deleting anything', () => {
  const result = spawnSync(bash, ['-c', 'docker() { return 1; }; source deploy/image-cleanup.sh'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8',
  })
  assert.notEqual(result.status, 0)
  assert.equal(result.stdout, '')
})
