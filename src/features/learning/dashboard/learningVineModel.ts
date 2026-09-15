import type { LearningGrowthLearner, LearningGrowthWaypoint } from '../contracts'
import profile from './assets/vine-profile.json'

export const VINE_ORIGIN = 76
export const VINE_TILE_WIDTH = 1200

export function vineSurfaceY(x: number): number {
  const sample = (((x % VINE_TILE_WIDTH) + VINE_TILE_WIDTH) % VINE_TILE_WIDTH) / VINE_TILE_WIDTH * (profile.length - 1)
  const index = Math.floor(sample)
  return 110 + ((profile[index] ?? 134) + ((profile[index + 1] ?? 134) - (profile[index] ?? 134)) * (sample - index)) / 2
}

export function layoutLearningVine(learners: LearningGrowthLearner[], viewportWidth: number) {
  const furthest = learners.reduce((maximum, learner) => Math.max(maximum, learner.points), 0)
  // CSS texture tiling and a bounded SVG viewport keep long histories off the GPU.
  const width = Math.max(viewportWidth, Math.min(60_000, furthest * 16 + VINE_ORIGIN * 2))
  const scale = furthest > 0 ? (width - VINE_ORIGIN * 2) / furthest : 0
  const x = (points: number) => VINE_ORIGIN + Math.max(0, Math.min(furthest, points)) * scale
  const groups: Array<{ x: number; learners: LearningGrowthLearner[] }> = []
  for (const learner of [...learners].sort((a, b) => a.points - b.points || a.learnerId.localeCompare(b.learnerId))) {
    const previous = groups.at(-1)
    if (previous && x(learner.points) - previous.x < 88) previous.learners.push(learner)
    else groups.push({ x: x(learner.points), learners: [learner] })
  }
  return { width, furthest, scale, x, groups }
}

/** Merge nearby stones for display while keeping every contribution and the final position. */
export function visibleVineWaypoints(waypoints: LearningGrowthWaypoint[], scale: number) {
  const stones: LearningGrowthWaypoint[] = []
  for (const point of waypoints) {
    const previous = stones.at(-1)
    if (previous && Math.floor(point.position * scale / 28) === Math.floor(previous.position * scale / 28)) {
      previous.position = point.position
      previous.evidenceCount += point.evidenceCount
      previous.objectiveCount += point.objectiveCount
    } else stones.push({ ...point })
  }
  return stones
}

export function vineScrollTarget(points: number, layout: ReturnType<typeof layoutLearningVine>, viewportWidth: number) {
  return Math.max(0, Math.min(layout.width - viewportWidth, layout.x(points) - viewportWidth / 2))
}
