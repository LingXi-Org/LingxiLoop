import FFT from 'fft.js'
import { boundedInteger, boundedNumber } from './bounds.js'
import { DCT_FIXTURES } from './fixtures.js'

export interface DctImageInput {
  size: 8 | 16
  keep: number
  /** Row-major, normalized grayscale pixels in [0, 1]; defaults to the fixed fixture. */
  pixels?: readonly number[]
}
export interface DctImageResult {
  size: 8 | 16
  original: number[]
  coefficients: number[]
  retained: number[]
  reconstructed: number[]
  mse: number
  maxError: number
}

function transform2d(pixels: readonly number[], size: number, line: (values: number[]) => number[]): number[] {
  const rows = Array.from({ length: size }, (_, row) => line(pixels.slice(row * size, (row + 1) * size)))
  const output = Array<number>(size * size)
  for (let column = 0; column < size; column += 1) {
    const values = line(rows.map((row) => row[column]))
    for (let row = 0; row < size; row += 1) output[row * size + column] = values[row]
  }
  return output
}

export function dctImage(input: DctImageInput): DctImageResult {
  const { size } = input
  if (size !== 8 && size !== 16) throw new RangeError('DCT supports only fixed 8x8 and 16x16 images')
  const keep = boundedInteger(input.keep, 'keep', 0, size * size)
  const pixels = input.pixels ?? DCT_FIXTURES[size]
  if (pixels.length !== size * size) throw new RangeError('Pixel count must match DCT dimensions')
  const original = Array.from(pixels, (value) => boundedNumber(value, 'pixel', 0, 1))
  const fft = new FFT(2 * size)
  const scales = Array.from({ length: size }, (_, k) => Math.sqrt((k === 0 ? 1 : 2) / size))
  const phases = Array.from({ length: size }, (_, k) => k * Math.PI / (2 * size))
  const coefficients = transform2d(original, size, (values) => {
    const spectrum = fft.createComplexArray()
    // Even extension gives a DCT-II after phase correction and orthonormal scaling.
    fft.realTransform(spectrum, [...values, ...values.slice().reverse()])
    return scales.map((scale, k) =>
      (spectrum[2 * k] * Math.cos(phases[k]) + spectrum[2 * k + 1] * Math.sin(phases[k])) * scale / 2)
  })
  const retained = Array<number>(size * size).fill(0)
  let count = 0
  for (let diagonal = 0; diagonal <= 2 * (size - 1); diagonal += 1) {
    const low = Math.max(0, diagonal - size + 1)
    const high = Math.min(diagonal, size - 1)
    for (let step = low; step <= high; step += 1) {
      const row = diagonal % 2 === 0 ? high - step + low : step
      const column = diagonal - row
      if (count < keep) retained[row * size + column] = coefficients[row * size + column]
      count += 1
    }
  }
  const reconstructed = transform2d(retained, size, (values) => {
    const spectrum = fft.createComplexArray()
    for (let k = 0; k < size; k += 1) {
      const magnitude = 2 * values[k] / scales[k]
      spectrum[2 * k] = magnitude * Math.cos(phases[k])
      spectrum[2 * k + 1] = magnitude * Math.sin(phases[k])
    }
    fft.completeSpectrum(spectrum)
    const output = fft.createComplexArray()
    fft.inverseTransform(output, spectrum)
    return values.map((_, i) => output[2 * i])
  })
  let squaredError = 0
  let maxError = 0
  for (let i = 0; i < original.length; i += 1) {
    const error = Math.abs(original[i] - reconstructed[i])
    squaredError += error * error
    maxError = Math.max(maxError, error)
  }
  return { size, original, coefficients, retained, reconstructed, mse: squaredError / original.length, maxError }
}
