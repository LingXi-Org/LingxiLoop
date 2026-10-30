import { CH_ARTIFACTS, publish, sub, type ArtifactEvent } from '../../redis.js'

// Replaces upstream's fs.watch + poll: every committed change is published once on
// CH_ARTIFACTS, and each web instance fans it out to its open editor streams.
type Listener = (event: ArtifactEvent) => void
const listeners = new Map<string, Set<Listener>>()
let attached = false

function attach() {
  if (attached) return
  attached = true
  sub.on('message', (channel, payload) => {
    if (channel !== CH_ARTIFACTS) return
    let event: ArtifactEvent
    try { event = JSON.parse(payload) as ArtifactEvent } catch { return }
    for (const listener of listeners.get(event.artifactId) ?? []) {
      try { listener(event) } catch { /* one stream never blocks the others */ }
    }
  })
}

export function onArtifactEvent(artifactId: string, listener: Listener) {
  attach()
  const set = listeners.get(artifactId) ?? new Set<Listener>()
  set.add(listener)
  listeners.set(artifactId, set)
  return () => {
    set.delete(listener)
    if (!set.size) listeners.delete(artifactId)
  }
}

export function publishArtifactEvent(event: Omit<ArtifactEvent, 'type' | 'timestamp'>) {
  return publish(CH_ARTIFACTS, { type: 'artifact.changed', timestamp: new Date().toISOString(), ...event })
}
