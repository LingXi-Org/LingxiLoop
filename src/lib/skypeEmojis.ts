/**
 * Classic Skype emoticon catalog.
 *
 * Each emoticon is a vertical sprite-sheet PNG bundled locally under
 * `public/skype-emojis/anim/{key}.png` — sourced from the
 * `demoive/skypecon` `anim@2x` set (40x40 frames stacked top-to-bottom,
 * transparent RGBA). Rendering uses CSS `steps()` animation, so we
 * carry the frame count alongside the catalog entry.
 *
 * Why bundled locally + sprite instead of animated GIF: GIF only has
 * 1-bit alpha, which reads as an ugly white box on coloured chat
 * bubbles. Sprite + alpha PNG keeps full transparency and stays under
 * 100KB even for the longest animation.
 *
 * Shortcode policy: ONLY the `(name)` style is matched (no `:)` /
 * `<3` ASCII forms — they collide too easily with normal punctuation
 * and URL syntax). Multiple `(name)` aliases per emoticon are kept;
 * the first one in the array is the canonical one inserted by the
 * composer picker.
 *
 * Catalog covers 107 emoticons (every active + a few "hidden"
 * shortcodes from the upstream YAML manifest that ship as files in
 * the anim@2x folder). Staff-only caricatures are intentionally
 * excluded.
 *
 * Image artwork is Microsoft IP, suitable for personal / internal
 * use; not licensed for unrestricted commercial redistribution.
 */

export interface SkypeEmoji {
  /** Internal key — also the PNG filename stem. */
  key: string
  /** Shortcodes that should be detected in message text. First entry
   *  is the canonical one inserted by the composer picker. */
  shortcodes: string[]
  /** Human label shown in tooltips / aria. */
  label: string
  /** Frame count in the sprite sheet — drives the CSS step animation. */
  frames: number
  /** Sound asset URL — undefined until the audio archive is wired up. */
  sound?: string
}

export const SKYPE_EMOJIS: readonly SkypeEmoji[] = [
  { key: 'angel', label: 'Angel', frames: 83, shortcodes: ['(angel)'] },
  { key: 'angry', label: 'Angry', frames: 113, shortcodes: ['(angry)'] },
  { key: 'bandit', label: 'Bandit', frames: 101, shortcodes: ['(bandit)'] },
  { key: 'bartlett', label: 'Soccer', frames: 79, shortcodes: ['(bartlett)', '(football)', '(soccer)', '(so)'] },
  { key: 'beer', label: 'Beer', frames: 75, shortcodes: ['(beer)'] },
  { key: 'bigsmile', label: 'Laugh', frames: 76, shortcodes: ['(laugh)', '(lol)'] },
  { key: 'bike', label: 'Bike', frames: 7, shortcodes: ['(bike)'] },
  { key: 'blackwidow', label: 'Black Widow', frames: 112, shortcodes: ['(blackwidow)'] },
  { key: 'blushing', label: 'Blush', frames: 68, shortcodes: ['(blush)'] },
  { key: 'bow', label: 'Bowing', frames: 59, shortcodes: ['(bow)'] },
  { key: 'brokenheart', label: 'Broken Heart', frames: 104, shortcodes: ['(brokenheart)'] },
  { key: 'bucky', label: 'Bucky', frames: 84, shortcodes: ['(bucky)'] },
  { key: 'bug', label: 'Bug', frames: 77, shortcodes: ['(bug)'] },
  { key: 'cake', label: 'Cake', frames: 99, shortcodes: ['(cake)'] },
  { key: 'call', label: 'Call', frames: 45, shortcodes: ['(call)'] },
  { key: 'captain', label: 'Captain America', frames: 77, shortcodes: ['(captain)'] },
  { key: 'cash', label: 'Cash', frames: 26, shortcodes: ['(cash)', '(mo)'] },
  { key: 'cat', label: 'Cat', frames: 119, shortcodes: ['(cat)'] },
  { key: 'clapping', label: 'Clapping', frames: 39, shortcodes: ['(clap)'] },
  { key: 'coffee', label: 'Coffee', frames: 27, shortcodes: ['(coffee)'] },
  { key: 'cool', label: 'Cool', frames: 37, shortcodes: ['(cool)'] },
  { key: 'crying', label: 'Crying', frames: 49, shortcodes: ['(cry)'] },
  { key: 'dancing', label: 'Dancing', frames: 205, shortcodes: ['(dance)'] },
  { key: 'devil', label: 'Devil', frames: 66, shortcodes: ['(devil)'] },
  { key: 'dog', label: 'Dog', frames: 53, shortcodes: ['(dog)'] },
  { key: 'doh', label: 'Doh!', frames: 59, shortcodes: ['(doh)'] },
  { key: 'drink', label: 'Drink', frames: 62, shortcodes: ['(drink)'] },
  { key: 'drunk', label: 'Drunk', frames: 48, shortcodes: ['(drunk)'] },
  { key: 'dull', label: 'Dull', frames: 76, shortcodes: ['(dull)'] },
  { key: 'emo', label: 'Emo', frames: 53, shortcodes: ['(emo)'] },
  { key: 'envy', label: 'Envy', frames: 67, shortcodes: ['(envy)'] },
  { key: 'evilgrin', label: 'Evil grin', frames: 77, shortcodes: ['(grin)'] },
  { key: 'facepalm', label: 'Facepalm', frames: 76, shortcodes: ['(facepalm)'] },
  { key: 'finger', label: 'Finger', frames: 41, shortcodes: ['(finger)'] },
  { key: 'fingerscrossed', label: 'Fingers', frames: 63, shortcodes: ['(fingerscrossed)', '(fingers)', '(yn)'] },
  { key: 'flower', label: 'Flower', frames: 82, shortcodes: ['(flower)'] },
  { key: 'fubar', label: 'Fubar', frames: 46, shortcodes: ['(fubar)'] },
  { key: 'giggle', label: 'Giggle', frames: 44, shortcodes: ['(chuckle)', '(giggle)'] },
  { key: 'handshake', label: 'Shaking Hands', frames: 61, shortcodes: ['(handshake)'] },
  { key: 'happy', label: 'Happy', frames: 69, shortcodes: ['(happy)'] },
  { key: 'headbang', label: 'Headbang', frames: 70, shortcodes: ['(banghead)', '(headbang)'] },
  { key: 'heart', label: 'Heart', frames: 16, shortcodes: ['(heart)'] },
  { key: 'heidy', label: 'Squirrel', frames: 74, shortcodes: ['(squirrel)', '(heidy)'] },
  { key: 'hi', label: 'Hi', frames: 56, shortcodes: ['(wave)', '(hi)'] },
  { key: 'highfive', label: 'High Five', frames: 37, shortcodes: ['(highfive)'] },
  { key: 'hug', label: 'Bear-hug', frames: 75, shortcodes: ['(bear)', '(hug)'] },
  { key: 'idea', label: 'Idea', frames: 118, shortcodes: ['(idea)'] },
  { key: 'inlove', label: 'In Love', frames: 62, shortcodes: ['(inlove)'] },
  { key: 'itwasntme', label: "It wasn't me", frames: 75, shortcodes: ['(wasntme)'] },
  { key: 'kiss', label: 'Kiss', frames: 59, shortcodes: ['(kiss)'] },
  { key: 'lalala', label: 'Lalala', frames: 19, shortcodes: ['(lalala)'] },
  { key: 'lipssealed', label: 'My lips are sealed', frames: 49, shortcodes: ['(lipssealed)'] },
  { key: 'mail', label: 'Mail', frames: 53, shortcodes: ['(mail)'] },
  { key: 'makeup', label: 'Make-up', frames: 107, shortcodes: ['(makeup)', '(kate)'] },
  { key: 'mmm', label: 'Mmm...', frames: 92, shortcodes: ['(mmmm)', '(mmm)', '(mm)'] },
  { key: 'mooning', label: 'Mooning', frames: 45, shortcodes: ['(mooning)'] },
  { key: 'movie', label: 'Movie', frames: 54, shortcodes: ['(movie)', '(film)'] },
  { key: 'muscle', label: 'Muscle', frames: 58, shortcodes: ['(muscle)', '(flex)'] },
  { key: 'music', label: 'Music', frames: 54, shortcodes: ['(music)'] },
  { key: 'nerd', label: 'Nerd', frames: 47, shortcodes: ['(nerd)'] },
  { key: 'nickfury', label: 'Nick Fury', frames: 104, shortcodes: ['(nickfury)'] },
  { key: 'ninja', label: 'Ninja', frames: 121, shortcodes: ['(ninja)'] },
  { key: 'no', label: 'No', frames: 54, shortcodes: ['(no)'] },
  { key: 'nod', label: 'Nodding', frames: 50, shortcodes: ['(nod)'] },
  { key: 'oliver', label: 'Oliver', frames: 63, shortcodes: ['(oliver)'] },
  { key: 'party', label: 'Party!!!', frames: 70, shortcodes: ['(party)'] },
  { key: 'phone', label: 'Phone', frames: 88, shortcodes: ['(phone)', '(mp)', '(ph)'] },
  { key: 'pizza', label: 'Pizza', frames: 90, shortcodes: ['(pizza)', '(pi)'] },
  { key: 'poolparty', label: 'Pool Party', frames: 87, shortcodes: ['(poolparty)'] },
  { key: 'puking', label: 'Puke', frames: 78, shortcodes: ['(puke)'] },
  { key: 'punch', label: 'Punching', frames: 43, shortcodes: ['(punch)'] },
  { key: 'rain', label: 'Raining', frames: 29, shortcodes: ['(london)', '(rain)', '(st)'] },
  { key: 'rock', label: "Rock 'n' Roll", frames: 11, shortcodes: ['(rock)'] },
  { key: 'rofl', label: 'Rolling on the floor laughing', frames: 80, shortcodes: ['(rofl)'] },
  { key: 'sadsmile', label: 'Sad', frames: 62, shortcodes: ['(sad)'] },
  { key: 'shake', label: 'Shaking', frames: 50, shortcodes: ['(shake)'] },
  { key: 'sheep', label: 'Sheep', frames: 110, shortcodes: ['(sheep)'] },
  { key: 'shielddeflect', label: 'Shield Deflect', frames: 91, shortcodes: ['(shielddeflect)'] },
  { key: 'skype', label: 'Skype', frames: 1, shortcodes: ['(skype)', '(ss)'] },
  { key: 'sleepy', label: 'Sleepy', frames: 71, shortcodes: ['(snooze)'] },
  { key: 'smile', label: 'Smile', frames: 52, shortcodes: ['(smile)'] },
  { key: 'smirk', label: 'Smirking', frames: 53, shortcodes: ['(smirk)'] },
  { key: 'smoking', label: 'Smoking', frames: 64, shortcodes: ['(smoking)', '(smoke)', '(ci)'] },
  { key: 'speechless', label: 'Speechless', frames: 66, shortcodes: ['(speechless)'] },
  { key: 'star', label: 'Star', frames: 63, shortcodes: ['(star)'] },
  { key: 'sunshine', label: 'Sun', frames: 26, shortcodes: ['(sun)'] },
  { key: 'surprised', label: 'Surprised', frames: 67, shortcodes: ['(surprised)'] },
  { key: 'swear', label: 'Swearing', frames: 76, shortcodes: ['(swear)'] },
  { key: 'sweating', label: 'Sweating', frames: 68, shortcodes: ['(sweat)'] },
  { key: 'talking', label: 'Talking', frames: 46, shortcodes: ['(talk)'] },
  { key: 'talktothehand', label: 'Talk to the hand', frames: 61, shortcodes: ['(talktothehand)'] },
  { key: 'thinking', label: 'Thinking', frames: 58, shortcodes: ['(think)'] },
  { key: 'time', label: 'Time', frames: 59, shortcodes: ['(time)'] },
  { key: 'tmi', label: 'Too much information', frames: 55, shortcodes: ['(tmi)'] },
  { key: 'toivo', label: 'Toivo', frames: 83, shortcodes: ['(toivo)'] },
  { key: 'tongueout', label: 'Cheeky', frames: 48, shortcodes: ['(tongueout)'] },
  { key: 'tumbleweed', label: 'Tumbleweed', frames: 31, shortcodes: ['(tumbleweed)'] },
  { key: 'wait', label: 'Wait', frames: 44, shortcodes: ['(wait)'] },
  { key: 'waiting', label: 'Waiting', frames: 50, shortcodes: ['(waiting)'] },
  { key: 'wfh', label: 'Working from home', frames: 78, shortcodes: ['(wfh)'] },
  { key: 'whew', label: 'Relieved', frames: 50, shortcodes: ['(relieved)', '(whew)'] },
  { key: 'wink', label: 'Wink', frames: 35, shortcodes: ['(wink)'] },
  { key: 'wondering', label: 'Wondering', frames: 69, shortcodes: ['(wonder)'] },
  { key: 'worried', label: 'Worried', frames: 55, shortcodes: ['(worried)'] },
  { key: 'wtf', label: 'WTF?', frames: 56, shortcodes: ['(wtf)'] },
  { key: 'yawning', label: 'Yawn', frames: 73, shortcodes: ['(yawn)'] },
  { key: 'yes', label: 'Yes', frames: 39, shortcodes: ['(yes)', '(ok)'] },
]

const BY_SHORTCODE = (() => {
  const m = new Map<string, SkypeEmoji>()
  for (const e of SKYPE_EMOJIS) {
    for (const sc of e.shortcodes) m.set(sc.toLowerCase(), e)
  }
  return m
})()

const BY_KEY = (() => {
  const m = new Map<string, SkypeEmoji>()
  for (const e of SKYPE_EMOJIS) m.set(e.key, e)
  return m
})()

/** Lookup by shortcode string like "(rofl)". Case-insensitive. */
export function findSkypeByShortcode(sc: string): SkypeEmoji | undefined {
  return BY_SHORTCODE.get(sc.toLowerCase())
}

/** Lookup by internal key like "rofl". */
export function findSkypeByKey(key: string): SkypeEmoji | undefined {
  return BY_KEY.get(key)
}

/** Single regex covering every registered (name) shortcode — built once.
 *  Used by the body parser to slice shortcodes out of plain-text spans. */
export const SKYPE_SHORTCODE_RE: RegExp = (() => {
  const escapedAll = Array.from(BY_SHORTCODE.keys())
    .sort((a, b) => b.length - a.length) // longer first so "(brokenheart)" wins over a shorter accidental overlap
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  return new RegExp(`(${escapedAll})`, 'gi')
})()

/** Animated sprite sheet URL — vertical strip of 40x40 frames. */
export function skypeEmojiUrl(key: string): string {
  return `/skype-emojis/anim/${key}.png`
}

/** Self-hosted sound file path. The audio archive isn't in any public
 *  repo, so we expect mp3s to land in `public/skype-sounds/{key}.mp3`
 *  out-of-band (e.g. extracted from a legacy Skype installer for
 *  internal use). Missing files cause `Audio.play()` to reject silently —
 *  the picker / message renderer never errors visibly. */
export function skypeSoundUrl(key: string): string {
  return `/skype-sounds/${key}.mp3`
}

// Cache one Audio element per key so repeated plays don't refetch.
const audioCache = new Map<string, HTMLAudioElement>()

/** Play the Skype sound for `key` (best-effort). No-op on the server,
 *  silently swallows missing-asset / autoplay-blocked errors. Resets
 *  the currentTime so a rapid second click re-triggers from the start
 *  instead of being ignored as "already playing". */
export function playSkypeSound(key: string): void {
  if (typeof window === 'undefined') return
  let audio = audioCache.get(key)
  if (!audio) {
    audio = new Audio(skypeSoundUrl(key))
    audio.preload = 'auto'
    audioCache.set(key, audio)
  }
  try { audio.currentTime = 0 } catch { /* some browsers throw if not ready */ }
  void audio.play().catch(() => { /* missing file or blocked autoplay */ })
}
