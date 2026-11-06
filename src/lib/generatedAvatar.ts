import { Avatar, Style } from '@dicebear/core'
import marbles from '@dicebear/styles/marbles.json' with { type: 'json' }
import planets from '@dicebear/styles/planets.json' with { type: 'json' }

const marblesStyle = new Style(marbles)
const planetsStyle = new Style(planets)

// Generation is deterministic per seed but costs a full SVG build. Avatars
// render in every list row and message, so each seed is generated once.
const MAX_CACHED = 512
function memoized(generate: (seed: string) => string) {
  const cache = new Map<string, string>()
  return (seed: string) => {
    const hit = cache.get(seed)
    if (hit !== undefined) return hit
    const value = generate(seed)
    if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value!)
    cache.set(seed, value)
    return value
  }
}

export const generatedUserAvatarUrl = memoized(seed =>
  new Avatar(marblesStyle, { seed: seed.trim() || 'tcyjnxy6' }).toDataUri())

export const generatedCourseAvatarUrl = memoized(seed => new Avatar(planetsStyle, {
  seed: seed.trim() || 'Felix',
  planetColor: ['e27a8c', 'e37f64', 'd88a40', 'c1982a', 'd67cb2'],
}).toDataUri())
