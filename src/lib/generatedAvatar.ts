import { Avatar, Style } from '@dicebear/core'
import marbles from '@dicebear/styles/marbles.json' with { type: 'json' }
import planets from '@dicebear/styles/planets.json' with { type: 'json' }

const marblesStyle = new Style(marbles)
const planetsStyle = new Style(planets)

export function generatedUserAvatarUrl(seed: string): string {
  return new Avatar(marblesStyle, { seed: seed.trim() || 'tcyjnxy6' }).toDataUri()
}

export function generatedCourseAvatarUrl(seed: string): string {
  return new Avatar(planetsStyle, {
    seed: seed.trim() || 'Felix',
    planetColor: ['e27a8c', 'e37f64', 'd88a40', 'c1982a', 'd67cb2'],
  }).toDataUri()
}
