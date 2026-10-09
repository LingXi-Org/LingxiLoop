import assert from 'node:assert/strict'
import test from 'node:test'
import { DCT_FIXTURES } from './fixtures.js'
import {
  centralLimit,
  dctImage,
  functionPlot,
  montyHallGame,
  montyHallSimulation,
  projectile,
} from './index.js'

// Failure modes: invalid/non-finite inputs; unbounded work; inconsistent units;
// missed/tangent/coincident roots; FFT scaling or ordering; lost histogram samples;
// non-reproducible draws; a host revealing the prize or the selected door.
const near = (actual: number, expected: number, tolerance = 1e-10) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`)
}

test('projectile uses SI units and lands at the analytic range', () => {
  const result = projectile({ angle: 45, speed: 10, gravity: 10 })
  near(result.range, 10)
  near(result.time, Math.SQRT2)
  near(result.height, 2.5)
  assert.deepEqual(result.points[0], { x: 0, y: 0, t: 0 })
  assert.equal(result.points.at(-1)?.y, 0)
  near(result.points.at(-1)!.x, result.range)
  assert.ok(result.points.every(({ x, y, t }) => [x, y, t].every(Number.isFinite)))
})

test('projectile handles rest, horizontal launches, vertical launches and elevated starts', () => {
  assert.deepEqual(projectile({ angle: 0, speed: 0, gravity: 9.8 }), {
    points: [{ x: 0, y: 0, t: 0 }], range: 0, time: 0, height: 0,
  })
  assert.equal(projectile({ angle: 0, speed: 10, gravity: 10 }).time, 0)
  assert.equal(projectile({ angle: 90, speed: 10, gravity: 10 }).range, 0)
  const elevated = projectile({ angle: 0, speed: 10, gravity: 10, height: 5 })
  near(elevated.time, 1)
  near(elevated.range, 10)
  near(elevated.height, 5)
  const extremeGravity = projectile({ angle: 0, speed: 0, gravity: 1e308, height: 1 })
  assert.ok(extremeGravity.time > 0 && Number.isFinite(extremeGravity.time))
  assert.ok(extremeGravity.points.every(({ y }) => y >= 0 && y <= 1))
})

test('projectile rejects invalid numbers, geometry and work budgets', () => {
  for (const update of [
    { angle: -1 }, { angle: 91 }, { speed: -1 }, { speed: 101 },
    { gravity: 0 }, { gravity: Number.NaN }, { height: -1 }, { height: Infinity },
    { samples: 1 }, { samples: 1002 }, { samples: 2.5 },
    { gravity: Number.MIN_VALUE },
  ]) assert.throws(() => projectile({ angle: 45, speed: 10, gravity: 10, ...update }), RangeError)
})

test('functionPlot samples polynomials and solves two intersections independently of sampling', () => {
  const result = functionPlot({
    curves: [{ id: 'parabola', a: 1, b: 0, c: 0 }, { id: 'line', a: 0, b: 0, c: 1 }],
    domain: [-2, 2], samples: 3,
  })
  assert.deepEqual(result.curves[0], {
    id: 'parabola', points: [{ x: -2, y: 4 }, { x: 0, y: 0 }, { x: 2, y: 4 }],
  })
  assert.deepEqual(result.intersections, [{
    firstId: 'parabola', secondId: 'line', kind: 'points', points: [{ x: -1, y: 1 }, { x: 1, y: 1 }],
  }])
})

test('functionPlot distinguishes tangency, no intersection, identical curves and off-screen roots', () => {
  const first = { id: 'first', a: 1, b: 0, c: 0 }
  const intersect = (second: typeof first, domain: [number, number] = [-2, 2]) =>
    functionPlot({ curves: [first, { ...second, id: 'second' }], domain }).intersections[0]
  assert.deepEqual(intersect({ ...first, a: 0 }).points, [{ x: 0, y: 0 }])
  assert.equal(intersect({ ...first, c: 1 }).kind, 'none')
  assert.equal(intersect(first).kind, 'coincident')
  assert.equal(intersect({ ...first, a: 0, c: 100 }).kind, 'none')
  assert.deepEqual(functionPlot({ curves: [
    { id: 'a', a: 0, b: 2, c: 1 }, { id: 'b', a: 0, b: -1, c: 4 },
  ], domain: [-2, 2] }).intersections[0].points, [{ x: 1, y: 3 }])
  assert.deepEqual(functionPlot({ curves: [
    { id: 'tiny', a: 1e-200, b: 0, c: -1e-200 }, { id: 'zero', a: 0, b: 0, c: 0 },
  ], domain: [-2, 2] }).intersections[0].points, [{ x: -1, y: 0 }, { x: 1, y: 0 }])
})

test('functionPlot rejects malformed curves and unbounded sampling', () => {
  const curves = [{ id: 'a', a: 0, b: 1, c: 0 }]
  for (const domain of [[1, 1], [2, 1], [-Infinity, 1], [-1, 1e7]] as [number, number][]) {
    assert.throws(() => functionPlot({ curves, domain }), RangeError)
  }
  assert.throws(() => functionPlot({ curves: [], domain: [-1, 1] }), RangeError)
  assert.throws(() => functionPlot({ curves: [curves[0], curves[0]], domain: [-1, 1] }), RangeError)
  assert.throws(() => functionPlot({ curves, domain: [-1, 1], samples: 1002 }), RangeError)
  assert.throws(() => functionPlot({ curves: [{ ...curves[0], b: NaN }], domain: [-1, 1] }), RangeError)
  assert.equal(functionPlot({ curves: [{ ...curves[0], id: '一次函数 f' }], domain: [-1, 1] }).curves[0].id, '一次函数 f')
})

test('DCT full reconstruction preserves normalized 8x8 and 16x16 images to 1e-9', () => {
  for (const size of [8, 16] as const) {
    const result = dctImage({ size, keep: size * size })
    assert.deepEqual(result.original, DCT_FIXTURES[size])
    assert.ok(result.maxError <= 1e-9)
    near(result.original.reduce((sum, value) => sum + value * value, 0),
      result.coefficients.reduce((sum, value) => sum + value * value, 0), 1e-9)
    assert.ok(result.reconstructed.every(Number.isFinite))
  }
})

test('DCT truncation follows zigzag and never increases MSE when more coefficients are retained', () => {
  let previousMse = Infinity
  for (let keep = 0; keep <= 64; keep += 1) {
    const result = dctImage({ size: 8, keep })
    assert.ok(result.mse <= previousMse + 1e-12)
    previousMse = result.mse
  }
  const dcOnly = dctImage({ size: 8, keep: 1 })
  const mean = dcOnly.original.reduce((sum, pixel) => sum + pixel, 0) / 64
  for (const pixel of dcOnly.reconstructed) near(pixel, mean)
  const firstThree = dctImage({ size: 8, keep: 3 })
  assert.ok(firstThree.retained.every((value, i) => [0, 1, 8].includes(i) || value === 0))
  const constant = dctImage({ size: 8, keep: 64, pixels: Array(64).fill(0.5) })
  near(constant.coefficients[0], 4)
  for (const value of constant.coefficients.slice(1)) near(value, 0)
})

test('DCT rejects unsupported dimensions, non-normalized inputs and coefficient budgets', () => {
  for (const keep of [-1, 65, 1.5, NaN]) assert.throws(() => dctImage({ size: 8, keep }), RangeError)
  for (const pixels of [Array(63).fill(0), Array(64).fill(256), Array(64).fill(NaN)]) {
    assert.throws(() => dctImage({ size: 8, keep: 1, pixels }), RangeError)
  }
  assert.throws(() => dctImage({ size: 4 as 8, keep: 1 }), RangeError)
})

test('CLT is seeded, conserves histogram counts and approaches known mean and mean variance', () => {
  for (const distribution of ['uniform', 'bernoulli', 'exponential'] as const) {
    const input = { distribution, sampleSize: 20, trials: 10000, seed: 42 }
    const result = centralLimit(input)
    assert.deepEqual(result, centralLimit(input))
    assert.equal(result.histogram.reduce((sum, bin) => sum + bin.count, 0), input.trials)
    assert.ok(result.means.every(Number.isFinite))
    near(result.mean, result.theoreticalMean, 0.01)
    near(result.variance, result.theoreticalVariance, 0.002)
    assert.equal(result.theoreticalMean, distribution === 'exponential' ? 1 : 0.5)
    assert.equal(result.theoreticalVariance,
      (distribution === 'exponential' ? 1 : distribution === 'bernoulli' ? 0.25 : 1 / 12) / 20)
  }
})

test('CLT handles a single observation and refuses excessive or invalid simulation inputs', () => {
  const input = { distribution: 'bernoulli' as const, sampleSize: 1, trials: 1, seed: 0 }
  const result = centralLimit(input)
  assert.equal(result.variance, 0)
  assert.equal(result.histogram.reduce((sum, bin) => sum + bin.count, 0), 1)
  for (const update of [
    { sampleSize: 0 }, { trials: 0 }, { sampleSize: 1001 }, { trials: 10001 },
    { sampleSize: 1000, trials: 10000 }, { seed: -1 }, { seed: 2 ** 32 },
    { seed: 0.5 }, { bins: 101 }, { bins: 1 }, { trials: NaN },
  ]) assert.throws(() => centralLimit({ ...input, ...update }), RangeError)
  assert.throws(() => centralLimit({ ...input, distribution: 'unknown' as 'uniform' }), RangeError)
})

test('Monty Hall host never opens the prize or selected door, and switching complements staying', () => {
  for (let seed = 0; seed < 300; seed += 1) {
    for (const selectedDoor of [0, 1, 2] as const) {
      const round = montyHallGame({ seed, selectedDoor })
      assert.deepEqual(round, montyHallGame({ seed, selectedDoor }))
      assert.notEqual(round.openedDoor, round.prizeDoor)
      assert.notEqual(round.openedDoor, selectedDoor)
      assert.notEqual(round.switchDoor, selectedDoor)
      assert.notEqual(round.switchDoor, round.openedDoor)
      assert.notEqual(round.switchWins, round.stayWins)
    }
  }
})

test('Monty Hall simulation reproduces the theoretical 1/3 and 2/3 comparison', () => {
  const input = { seed: 42, trials: 100000 }
  const result = montyHallSimulation(input)
  assert.deepEqual(result, montyHallSimulation(input))
  assert.equal(result.stayWins + result.switchWins, result.trials)
  assert.equal(result.theoreticalStayRate, 1 / 3)
  assert.equal(result.theoreticalSwitchRate, 2 / 3)
  near(result.stayRate, 1 / 3, 0.01)
  near(result.switchRate, 2 / 3, 0.01)
  for (const trials of [0, 100001, 1.5, Infinity]) {
    assert.throws(() => montyHallSimulation({ seed: 0, trials }), RangeError)
  }
  assert.throws(() => montyHallGame({ seed: 0, selectedDoor: 3 as 0 }), RangeError)
  assert.throws(() => montyHallGame({ seed: NaN, selectedDoor: 0 }), RangeError)
})
