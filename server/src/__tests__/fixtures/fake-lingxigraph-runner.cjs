let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => { input += chunk })
process.stdin.on('end', () => {
  JSON.parse(input)
  const mode = process.env.FAKE_LINGXIGRAPH_MODE
  if (mode === 'nonzero') { process.stderr.write('model failed'); process.exit(7) }
  if (mode === 'invalid') { process.stdout.write('{bad json'); return }
  if (mode === 'oversized') { process.stdout.write('x'.repeat(2048)); return }
  if (mode === 'delay') { setTimeout(() => process.stdout.write('{}'), 500); return }
  process.stdout.write(JSON.stringify({ version: 1, status: 'done', reason: 'fake', actions: [], modelCalls: [] }))
})
