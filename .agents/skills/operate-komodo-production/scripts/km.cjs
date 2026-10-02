const { spawnSync } = require('node:child_process')
const { existsSync } = require('node:fs')

const wsl = 'C:\\Windows\\System32\\wsl.exe'
const km = 'C:\\Users\\34395\\.codex\\bin\\wsl\\km'
const variables = ['KOMODO_CLI_KEY', 'KOMODO_CLI_SECRET', 'KOMODO_CLI_HOST']
if (!process.env.KOMODO_API_KEY || !process.env.KOMODO_API_SECRET) {
  console.error('Missing Komodo credentials; run this script through Sigillo prod.')
  process.exit(1)
} else if (!existsSync(wsl) || !existsSync(km)) {
  console.error('Expected WSL or official Komodo binary is missing; stop and repair the local CLI installation.')
  process.exit(1)
} else {
  const env = {
    ...process.env,
    KOMODO_CLI_KEY: process.env.KOMODO_API_KEY,
    KOMODO_CLI_SECRET: process.env.KOMODO_API_SECRET,
    KOMODO_CLI_HOST: 'https://ops.christmas1314.xyz',
    WSLENV: [...(process.env.WSLENV || '').split(':').filter((entry) => entry && !variables.includes(entry.split('/')[0])), ...variables].join(':'),
  }
  const result = spawnSync(wsl, ['--', '/mnt/c/Users/34395/.codex/bin/wsl/km', ...process.argv.slice(2)], { stdio: 'inherit', env })
  if (result.error) console.error('Unable to start the official Komodo CLI through WSL.')
  process.exit(result.status ?? 1)
}
