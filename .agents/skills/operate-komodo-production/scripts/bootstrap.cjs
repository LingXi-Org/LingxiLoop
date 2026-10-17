const { spawnSync } = require('node:child_process')
const { existsSync } = require('node:fs')

const ssh = 'C:\\Windows\\System32\\OpenSSH\\ssh.exe'
const [action, target, ...extra] = process.argv.slice(2)
const keys = target === 'core'
  ? ['KOMODO_DATABASE_USERNAME', 'KOMODO_DATABASE_PASSWORD', 'KOMODO_ADMIN_PASSWORD', 'KOMODO_JWT_SECRET', 'KOMODO_WEBHOOK_SECRET']
  : []
if (!['validate', 'create', 'up'].includes(action) || !['core', 'control-ingress'].includes(target) || extra.length) {
  console.error('Usage: bootstrap.cjs <validate|create|up> <core|control-ingress> (txy3 only).')
  process.exit(1)
} else if (keys.some(key => !process.env[key])) {
  console.error('Missing bootstrap credentials; run through Sigillo prod.')
  process.exit(1)
} else if (!existsSync(ssh)) {
  console.error('Expected Windows OpenSSH binary is missing.')
  process.exit(1)
} else {
  const env = target === 'core'
    ? Object.fromEntries(keys.map(key => [key, process.env[key]]))
    : { ACME_EMAIL: process.env.ACME_EMAIL || 'no-reply@lingxilearn.cn' }
  const command = ['docker', 'compose', '-f', `/opt/komodo/bootstrap/${target}/compose.yml`,
    ...(action === 'validate' ? ['config', '--quiet'] : action === 'create' ? ['create', '--pull', 'never'] : ['up', '-d', '--pull', 'never'])]
  // JSON stdin avoids putting credentials in shell source, process arguments, or env files.
  const requireState = action === 'up' && target === 'core'
  const remote = "python3 -c 'import json,os,subprocess,sys; p=json.load(sys.stdin); assert not p[\"requireState\"] or all(os.path.getsize(f)>0 if os.path.isfile(f) else False for f in [\"/var/lib/docker/volumes/komodo_mongo-data/_data/WiredTiger\",\"/var/lib/docker/volumes/komodo_keys/_data/core.key\"]), \"Refusing to initialize empty production Core: restore MongoDB and Core keys first\"; os.environ.update(p[\"env\"]); sys.exit(subprocess.call(p[\"command\"]))'"
  const result = spawnSync(ssh, ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', 'txy3', remote], {
    input: JSON.stringify({ env, command, requireState }), stdio: ['pipe', 'inherit', 'inherit'],
  })
  if (result.error) console.error('Unable to start control-plane bootstrap over SSH.')
  if (result.status === 0) console.log(`txy3 ${target}: ${action} completed`)
  process.exit(result.status ?? 1)
}
