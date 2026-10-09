import { boundedInteger } from './bounds.js'

function seededRandom(seed: number): () => number {
  let state = boundedInteger(seed, 'seed', 0, 0xffffffff)
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), state | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export type CltDistribution = 'uniform' | 'bernoulli' | 'exponential'
export interface CentralLimitInput {
  distribution: CltDistribution
  sampleSize: number
  trials: number
  seed: number
  bins?: number
}
export interface HistogramBin { lower: number; upper: number; count: number }
export interface CentralLimitResult {
  means: number[]
  histogram: HistogramBin[]
  mean: number
  /** Population variance of the generated sample means. */
  variance: number
  theoreticalMean: number
  theoreticalVariance: number
}

/** U(0,1), Bernoulli(0.5), or Exp(rate=1), with at most 1,000,000 individual draws. */
export function centralLimit(input: CentralLimitInput): CentralLimitResult {
  const sampleSize = boundedInteger(input.sampleSize, 'sampleSize', 1, 1000)
  const trials = boundedInteger(input.trials, 'trials', 1, 10000)
  const bins = boundedInteger(input.bins ?? 20, 'bins', 2, 100)
  if (sampleSize * trials > 1e6) throw new RangeError('CLT exceeds the 1,000,000 draw budget')
  const random = seededRandom(input.seed)
  let draw: () => number
  let theoreticalMean: number
  let populationVariance: number
  switch (input.distribution) {
    case 'uniform':
      draw = random
      theoreticalMean = 0.5
      populationVariance = 1 / 12
      break
    case 'bernoulli':
      draw = () => random() < 0.5 ? 1 : 0
      theoreticalMean = 0.5
      populationVariance = 0.25
      break
    case 'exponential':
      draw = () => -Math.log1p(-random())
      theoreticalMean = 1
      populationVariance = 1
      break
    default:
      throw new RangeError('Unknown CLT distribution')
  }
  const means = Array.from({ length: trials }, () => {
    let sum = 0
    for (let i = 0; i < sampleSize; i += 1) sum += draw()
    return sum / sampleSize
  })
  const mean = means.reduce((sum, value) => sum + value, 0) / trials
  const variance = means.reduce((sum, value) => sum + (value - mean) ** 2, 0) / trials
  let min = Infinity
  let max = -Infinity
  for (const value of means) {
    min = Math.min(min, value)
    max = Math.max(max, value)
  }
  if (min === max) { min -= 0.5; max += 0.5 }
  const width = (max - min) / bins
  const histogram = Array.from({ length: bins }, (_, i) => ({
    lower: min + i * width, upper: min + (i + 1) * width, count: 0,
  }))
  for (const value of means) histogram[Math.min(bins - 1, Math.floor((value - min) / width))].count += 1
  return { means, histogram, mean, variance, theoreticalMean, theoreticalVariance: populationVariance / sampleSize }
}

export type Door = 0 | 1 | 2
export interface MontyHallGameInput { seed: number; selectedDoor: Door }
export interface MontyHallGameResult {
  prizeDoor: Door
  selectedDoor: Door
  openedDoor: Door
  switchDoor: Door
  stayWins: boolean
  switchWins: boolean
}
export interface MontyHallSimulationInput { seed: number; trials: number }
export interface MontyHallSimulationResult {
  trials: number
  stayWins: number
  switchWins: number
  stayRate: number
  switchRate: number
  theoreticalStayRate: number
  theoreticalSwitchRate: number
}

const doors: readonly Door[] = [0, 1, 2]

function playRound(random: () => number, selectedDoor: Door): MontyHallGameResult {
  const prizeDoor = Math.floor(random() * 3) as Door
  const candidates = doors.filter((door) => door !== prizeDoor && door !== selectedDoor)
  const openedDoor = candidates[Math.floor(random() * candidates.length)]
  const switchDoor = doors.find((door) => door !== selectedDoor && door !== openedDoor)!
  return { prizeDoor, selectedDoor, openedDoor, switchDoor, stayWins: selectedDoor === prizeDoor, switchWins: switchDoor === prizeDoor }
}

/** The informed host always opens one unselected goat door and always offers a switch. */
export function montyHallGame(input: MontyHallGameInput): MontyHallGameResult {
  boundedInteger(input.selectedDoor, 'selectedDoor', 0, 2)
  return playRound(seededRandom(input.seed), input.selectedDoor)
}

/** Pure and bounded; the UI runs batches in a dedicated, terminable Worker. */
export function montyHallSimulation(input: MontyHallSimulationInput): MontyHallSimulationResult {
  const trials = boundedInteger(input.trials, 'trials', 1, 100000)
  const random = seededRandom(input.seed)
  let stayWins = 0
  for (let i = 0; i < trials; i += 1) {
    if (playRound(random, Math.floor(random() * 3) as Door).stayWins) stayWins += 1
  }
  const switchWins = trials - stayWins
  return { trials, stayWins, switchWins, stayRate: stayWins / trials, switchRate: switchWins / trials,
    theoreticalStayRate: 1 / 3, theoreticalSwitchRate: 2 / 3 }
}
