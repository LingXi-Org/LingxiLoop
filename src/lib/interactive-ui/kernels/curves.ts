import { boundedInteger, boundedNumber } from './bounds.js'

export interface Point { x: number; y: number }
export interface ProjectileInput {
  angle: number
  speed: number
  gravity: number
  height?: number
  samples?: number
}
export interface ProjectileResult {
  points: (Point & { t: number })[]
  range: number
  time: number
  /** Maximum altitude above the ground, in metres. */
  height: number
}

/** Angle in degrees; speed in m/s; gravity in m/s²; height in metres. No air resistance. */
export function projectile(input: ProjectileInput): ProjectileResult {
  const angle = boundedNumber(input.angle, 'angle', 0, 90)
  const speed = boundedNumber(input.speed, 'speed', 0, 100)
  const gravity = boundedNumber(input.gravity, 'gravity', Number.MIN_VALUE, Number.MAX_VALUE)
  const startHeight = boundedNumber(input.height ?? 0, 'height', 0, Number.MAX_VALUE)
  const samples = boundedInteger(input.samples ?? 121, 'samples', 2, 1001)
  const radians = angle * Math.PI / 180
  const vx = angle === 90 ? 0 : speed * Math.cos(radians)
  const vy = speed * Math.sin(radians)
  const apexTime = vy / gravity
  const time = apexTime + Math.hypot(apexTime, Math.SQRT2 * Math.sqrt(startHeight) / Math.sqrt(gravity))
  const range = vx * time
  const height = startHeight + vy * vy / (2 * gravity)
  if (![time, range, height].every(Number.isFinite)) {
    throw new RangeError('Projectile results exceed finite numeric precision')
  }
  const points = time === 0 ? [{ x: 0, y: startHeight, t: 0 }] : Array.from({ length: samples }, (_, i) => {
    const t = time * (i / (samples - 1))
    const x = vx * t
    const y = i === samples - 1 ? 0 : Math.max(0, startHeight + t * (vy - (gravity / 2) * t))
    if (![x, y, t].every(Number.isFinite)) throw new RangeError('Projectile trajectory exceeds finite numeric precision')
    return { x, y, t }
  })
  return { points, range, time, height }
}

/** y = ax² + bx + c; a = 0 represents a linear function. */
export interface Polynomial { id: string; a: number; b: number; c: number }
export interface FunctionPlotInput {
  curves: readonly Polynomial[]
  domain: readonly [number, number]
  samples?: number
}
export interface FunctionIntersection {
  firstId: string
  secondId: string
  kind: 'none' | 'coincident' | 'points'
  /** Analytically computed intersections inside the displayed domain. */
  points: Point[]
}
export interface FunctionPlotResult {
  curves: { id: string; points: Point[] }[]
  intersections: FunctionIntersection[]
}

function evaluate(curve: Polynomial, x: number): number {
  return (curve.a * x + curve.b) * x + curve.c
}

function roots(a: number, b: number, c: number): number[] {
  if (a === 0) return b === 0 ? [] : [-c / b]
  const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c))
  a /= scale
  b /= scale
  c /= scale
  const discriminant = b * b - 4 * a * c
  if (discriminant < 0) return []
  if (discriminant === 0) return [-b / (2 * a)]
  // The conjugate root avoids subtracting nearly equal floating-point values.
  const q = -0.5 * (b + (b >= 0 ? 1 : -1) * Math.sqrt(discriminant))
  return [q / a, c / q].sort((left, right) => left - right)
}

export function functionPlot(input: FunctionPlotInput): FunctionPlotResult {
  if (!Array.isArray(input.curves) || input.curves.length < 1 || input.curves.length > 4) {
    throw new RangeError('There must be between 1 and 4 curves')
  }
  if (!Array.isArray(input.domain) || input.domain.length !== 2) throw new RangeError('Domain requires two endpoints')
  const min = boundedNumber(input.domain[0], 'domain minimum', -1e6, 1e6)
  const max = boundedNumber(input.domain[1], 'domain maximum', -1e6, 1e6)
  if (min >= max) throw new RangeError('Domain minimum must be less than maximum')
  const samples = boundedInteger(input.samples ?? 201, 'samples', 2, 1001)
  const ids = new Set<string>()
  for (const curve of input.curves) {
    if (typeof curve.id !== 'string' || !curve.id.length || curve.id.length > 160 || ids.has(curve.id)) {
      throw new RangeError('Curve IDs must be unique labels between 1 and 160 characters')
    }
    ids.add(curve.id)
    for (const coefficient of ['a', 'b', 'c'] as const) boundedNumber(curve[coefficient], coefficient, -1e6, 1e6)
  }
  const curves = input.curves.map((curve) => ({
    id: curve.id,
    points: Array.from({ length: samples }, (_, i) => {
      const x = min + (max - min) * i / (samples - 1)
      return { x, y: evaluate(curve, x) }
    }),
  }))
  const intersections: FunctionIntersection[] = []
  for (let i = 0; i < input.curves.length; i += 1) {
    for (let j = i + 1; j < input.curves.length; j += 1) {
      const first = input.curves[i]
      const second = input.curves[j]
      const a = first.a - second.a
      const b = first.b - second.b
      const c = first.c - second.c
      const points = roots(a, b, c).filter((x) => x >= min && x <= max).map((root) => {
        const x = root === 0 ? 0 : root
        return { x, y: evaluate(first, x) }
      })
      intersections.push({
        firstId: first.id, secondId: second.id,
        kind: a === 0 && b === 0 && c === 0 ? 'coincident' : points.length ? 'points' : 'none',
        points,
      })
    }
  }
  return { curves, intersections }
}
