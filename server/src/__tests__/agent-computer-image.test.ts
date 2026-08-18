import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'

test('agent-computer image installs the shell and JSON tools required by the bash runtime', async () => {
  const dockerfile = await readFile(
    new URL('../../../server/docker/agent-computer.Dockerfile', import.meta.url),
    'utf8',
  )
  assert.match(dockerfile, /apt-get install[\s\S]*\bbash\b/)
  assert.match(dockerfile, /apt-get install[\s\S]*\bjq\b/)
})
