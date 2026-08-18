/**
 * Cumora notification chime — a soft, sky-themed two-note bell.
 *
 * Synthesized via Web Audio API instead of shipping a binary asset:
 *  - no MP3/OGG to bundle (saves ~20 KB)
 *  - the timbre stays under our control instead of drifting with
 *    whatever stock sound a recording happens to use
 *  - lighter on Electron's renderer (no decode pass on every fire)
 *
 * Sound design:
 *  - Two sine notes a perfect fourth apart (G6 → C7) — high register
 *    matches the cloud / sky palette: light, airy, not boomy.
 *  - Quick attack (~12ms), exponential decay over ~420ms — clean tap,
 *    no sustained ringing.
 *  - 80ms stagger between notes so it reads as a chime, not a chord.
 *  - Master gain capped at 0.18 — clearly audible but not startling
 *    when you're focused on something else.
 *  - A faint sub-octave triangle underneath each note adds warmth so
 *    it doesn't feel thin on cheap laptop speakers.
 */

let ctx: AudioContext | null = null
let unlocked = false

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext }
    const Ctor = window.AudioContext || (window as WebkitWindow).webkitAudioContext
    if (!Ctor) return null
    try { ctx = new Ctor() } catch { return null }
  }
  return ctx
}

/** Some browsers (and Electron in strict modes) suspend AudioContext
 *  until a user gesture. We piggy-back on the first click/keydown to
 *  resume it so the very first notification after sign-in is audible. */
function ensureUnlocked() {
  if (unlocked) return
  const c = getCtx()
  if (!c) return
  const tryResume = () => {
    if (c.state === 'suspended') void c.resume().catch(() => { /* swallow */ })
    unlocked = true
    window.removeEventListener('pointerdown', tryResume)
    window.removeEventListener('keydown', tryResume)
  }
  window.addEventListener('pointerdown', tryResume, { once: true })
  window.addEventListener('keydown', tryResume, { once: true })
}

if (typeof window !== 'undefined') ensureUnlocked()

export function playNotificationChime(): void {
  const c = getCtx()
  if (!c) return
  if (c.state === 'suspended') {
    // Best-effort resume — fire-and-forget. If the policy still blocks
    // us, the chime is just silent for this one fire; the next user
    // gesture will unlock subsequent fires.
    void c.resume().catch(() => { /* swallow */ })
  }

  const now = c.currentTime
  const master = c.createGain()
  master.gain.value = 0.18
  master.connect(c.destination)

  const notes = [
    { freq: 1568.0, start: 0,    dur: 0.42 },  // G6
    { freq: 2093.0, start: 0.08, dur: 0.45 },  // C7 — pitched up for "lift"
  ]

  for (const n of notes) {
    // Primary sine — the "bell".
    const sine = c.createOscillator()
    sine.type = 'sine'
    sine.frequency.value = n.freq
    const sineEnv = c.createGain()
    sineEnv.gain.setValueAtTime(0, now + n.start)
    sineEnv.gain.linearRampToValueAtTime(0.9, now + n.start + 0.012)
    sineEnv.gain.exponentialRampToValueAtTime(0.001, now + n.start + n.dur)
    sine.connect(sineEnv)
    sineEnv.connect(master)
    sine.start(now + n.start)
    sine.stop(now + n.start + n.dur + 0.05)

    // Sub-octave triangle pad — warmth on small speakers.
    const tri = c.createOscillator()
    tri.type = 'triangle'
    tri.frequency.value = n.freq * 0.5
    const triEnv = c.createGain()
    triEnv.gain.setValueAtTime(0, now + n.start)
    triEnv.gain.linearRampToValueAtTime(0.18, now + n.start + 0.020)
    triEnv.gain.exponentialRampToValueAtTime(0.001, now + n.start + n.dur)
    tri.connect(triEnv)
    triEnv.connect(master)
    tri.start(now + n.start)
    tri.stop(now + n.start + n.dur + 0.05)
  }
}
