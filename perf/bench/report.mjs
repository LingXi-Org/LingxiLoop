import assert from 'node:assert/strict'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { PNG } from 'pngjs'

// Reject missing/failed samples, regressions, lost content, and changed layout.
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1]
assert.equal(percentile([40, 10, 30, 20], .75), 30)
const directory = process.argv[2] ?? 'perf/bench/results'
const check = process.argv.includes('--check')
const ratchet = JSON.parse(await readFile(new URL('./ratchet.json', import.meta.url)))
const files = await readdir(directory)
const summary = {}
for (const scenario of ['login', 'chat']) {
  summary[scenario] = {}
  for (const variant of ['base', 'candidate']) {
    const sampleNames = files.filter(name => new RegExp(`^${scenario}-\\d+-${variant}\\.json$`).test(name))
    const samples = await Promise.all(sampleNames.map(async name => JSON.parse(await readFile(`${directory}/${name}`))))
    if (check) assert.ok(samples.length >= ratchet.minimumRuns, `${scenario}/${variant}: requires ${ratchet.minimumRuns} cold samples`)
    if (!samples.length) continue
    const metrics = ['ready', 'input', 'workspace', 'lcp', 'longTasks', 'cls']
    const counts = samples.map(sample => ({
      scriptBytes: sample.resources.filter(resource => resource.name.endsWith('.js')).reduce((total, resource) => total + resource.encoded, 0),
      cssBytes: sample.resources.filter(resource => resource.name.endsWith('.css')).reduce((total, resource) => total + resource.encoded, 0),
      requests: sample.resources.length,
    }))
    const result = { samples: samples.length, from: samples[0].measuredAt, to: samples.at(-1).measuredAt }
    for (const metric of [...metrics, 'scriptBytes', 'cssBytes', 'requests']) {
      const values = metrics.includes(metric) ? samples.map(sample => sample[metric]) : counts.map(count => count[metric])
      assert.ok(values.every(Number.isFinite), `Invalid ${scenario}/${variant}/${metric}`)
      result[metric] = Object.fromEntries([.5, .75, .95].map(p => [`p${p * 100}`, Math.round(percentile(values, p) * 100) / 100]))
      if (check && variant === 'candidate' && metric in ratchet.ceilings[scenario]) assert.ok(result[metric].p75 <= ratchet.ceilings[scenario][metric], `${scenario}/${metric}: ${result[metric].p75} > ${ratchet.ceilings[scenario][metric]}`)
    }
    summary[scenario][variant] = result
  }
  if (check) {
    for (const metric of ['ready', 'input']) assert.ok(summary[scenario].candidate[metric].p75 <= summary[scenario].base[metric].p75, `${scenario}/${metric}: regressed against paired baseline`)
    assert.ok(summary[scenario].candidate.cls.p75 <= summary[scenario].base.cls.p75 + .01, `${scenario}: layout shift regressed`)
  }
}
for (const scenario of ['login', 'chat']) for (const width of [1440, 390]) {
  const base = `${scenario}-${width}-base`
  const candidate = `${scenario}-${width}-candidate`
  const present = files.includes(`${base}-golden.json`) && files.includes(`${candidate}-golden.json`)
  if (check) assert.ok(present, `${scenario}/${width}: missing visual evidence`)
  if (!present) continue
  const read = async name => JSON.parse(await readFile(`${directory}/${name}-golden.json`))
  const a = await read(base), b = await read(candidate)
  const textEqual = a.title === b.title && a.text === b.text
  const fieldsEqual = JSON.stringify(a.fields) === JSON.stringify(b.fields)
  const left = PNG.sync.read(await readFile(`${directory}/${base}.png`))
  const right = PNG.sync.read(await readFile(`${directory}/${candidate}.png`))
  assert.equal(left.width, right.width); assert.equal(left.height, right.height)
  let different = 0
  for (let i = 0; i < left.data.length; i += 4) if ([0, 1, 2].some(channel => Math.abs(left.data[i + channel] - right.data[i + channel]) > 16)) different++
  const pixelDifference = different / (left.width * left.height)
  summary[scenario][`visual${width}`] = { textEqual, fieldsEqual, pixelDifference }
  if (check) {
    assert.ok(textEqual, `${scenario}/${width}: visible content changed`)
    assert.ok(fieldsEqual, `${scenario}/${width}: input geometry changed`)
    assert.ok(pixelDifference <= .005, `${scenario}/${width}: screenshot changed ${(pixelDifference * 100).toFixed(2)}%`)
  }
}
await writeFile(`${directory}/summary.json`, JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary, null, 2))
