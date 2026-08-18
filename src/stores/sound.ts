/**
 * Per-device Skype emoticon sound toggle. Kept local (localStorage)
 * rather than synced through the server-side preferences store — sound
 * is a per-device concern (work laptop muted, home laptop on), and
 * shipping it to the server would mean every device hears the same
 * setting whether the user wanted that or not.
 */
import { create } from 'zustand'

interface SoundState {
  muted: boolean
  setMuted(next: boolean): void
}

const STORAGE_KEY = 'cumora.skype.muted'

function readInitialMuted(): boolean {
  if (typeof window === 'undefined') return true
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    // Default: muted. Sound emoticons are off until the user opts in —
    // an unexpected (clap) blasting through speakers in a quiet meeting
    // is the kind of "feature" people remember in the worst way.
    if (raw === null) return true
    return raw === 'true'
  } catch {
    return true
  }
}

export const useSoundStore = create<SoundState>((set) => ({
  muted: readInitialMuted(),
  setMuted(next) {
    set({ muted: next })
    try { window.localStorage.setItem(STORAGE_KEY, String(next)) } catch { /* ignore */ }
  },
}))
