// Uses an already approved/running loopback HTTP proxy. Does not alter daemon settings.
import { spawnSync } from 'node:child_process'
const targets = ['https://api.github.com/','https://npm.pkg.github.com/@lyyzka%2flingxios','https://ghcr.io/v2/','https://github.com/']
let failed = false
for (const url of targets) {
  const r = spawnSync('curl', ['--silent','--show-error','--output','/dev/null','--write-out','%{http_code}','--proxy','http://127.0.0.1:17890','--noproxy','','--proto','=https','--connect-timeout','10','--max-time','25',url], { encoding:'utf8',env:{PATH:process.env.PATH},timeout:30000 })
  const status = r.stdout?.trim(), passed = r.status === 0 && ['200','401','404'].includes(status)
  failed ||= !passed
  console.log(JSON.stringify({ origin: new URL(url).origin, status: /^\d{3}$/.test(status) ? Number(status) : null, tlsAndHttpReachable: passed, authenticatedPullVerified: false }))
}
if (failed) process.exitCode = 1
