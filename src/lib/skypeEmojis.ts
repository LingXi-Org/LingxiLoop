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
  { key: 'angel', label: '天使', frames: 83, shortcodes: ['(angel)'] },
  { key: 'angry', label: '生气', frames: 113, shortcodes: ['(angry)'] },
  { key: 'bandit', label: '蒙面人', frames: 101, shortcodes: ['(bandit)'] },
  { key: 'bartlett', label: '足球', frames: 79, shortcodes: ['(bartlett)', '(football)', '(soccer)', '(so)'] },
  { key: 'beer', label: '啤酒', frames: 75, shortcodes: ['(beer)'] },
  { key: 'bigsmile', label: '大笑', frames: 76, shortcodes: ['(laugh)', '(lol)'] },
  { key: 'bike', label: '自行车', frames: 7, shortcodes: ['(bike)'] },
  { key: 'blackwidow', label: '黑寡妇', frames: 112, shortcodes: ['(blackwidow)'] },
  { key: 'blushing', label: '害羞', frames: 68, shortcodes: ['(blush)'] },
  { key: 'bow', label: '鞠躬', frames: 59, shortcodes: ['(bow)'] },
  { key: 'brokenheart', label: '心碎', frames: 104, shortcodes: ['(brokenheart)'] },
  { key: 'bucky', label: '巴基', frames: 84, shortcodes: ['(bucky)'] },
  { key: 'bug', label: '小虫', frames: 77, shortcodes: ['(bug)'] },
  { key: 'cake', label: '蛋糕', frames: 99, shortcodes: ['(cake)'] },
  { key: 'call', label: '打电话', frames: 45, shortcodes: ['(call)'] },
  { key: 'captain', label: '美国队长', frames: 77, shortcodes: ['(captain)'] },
  { key: 'cash', label: '钞票', frames: 26, shortcodes: ['(cash)', '(mo)'] },
  { key: 'cat', label: '猫咪', frames: 119, shortcodes: ['(cat)'] },
  { key: 'clapping', label: '鼓掌', frames: 39, shortcodes: ['(clap)'] },
  { key: 'coffee', label: '咖啡', frames: 27, shortcodes: ['(coffee)'] },
  { key: 'cool', label: '酷', frames: 37, shortcodes: ['(cool)'] },
  { key: 'crying', label: '哭泣', frames: 49, shortcodes: ['(cry)'] },
  { key: 'dancing', label: '跳舞', frames: 205, shortcodes: ['(dance)'] },
  { key: 'devil', label: '小恶魔', frames: 66, shortcodes: ['(devil)'] },
  { key: 'dog', label: '狗狗', frames: 53, shortcodes: ['(dog)'] },
  { key: 'doh', label: '哎呀', frames: 59, shortcodes: ['(doh)'] },
  { key: 'drink', label: '喝一杯', frames: 62, shortcodes: ['(drink)'] },
  { key: 'drunk', label: '喝醉', frames: 48, shortcodes: ['(drunk)'] },
  { key: 'dull', label: '无聊', frames: 76, shortcodes: ['(dull)'] },
  { key: 'emo', label: '忧郁', frames: 53, shortcodes: ['(emo)'] },
  { key: 'envy', label: '羡慕', frames: 67, shortcodes: ['(envy)'] },
  { key: 'evilgrin', label: '坏笑', frames: 77, shortcodes: ['(grin)'] },
  { key: 'facepalm', label: '捂脸', frames: 76, shortcodes: ['(facepalm)'] },
  { key: 'finger', label: '手指', frames: 41, shortcodes: ['(finger)'] },
  { key: 'fingerscrossed', label: '祈求好运', frames: 63, shortcodes: ['(fingerscrossed)', '(fingers)', '(yn)'] },
  { key: 'flower', label: '鲜花', frames: 82, shortcodes: ['(flower)'] },
  { key: 'fubar', label: '崩溃', frames: 46, shortcodes: ['(fubar)'] },
  { key: 'giggle', label: '偷笑', frames: 44, shortcodes: ['(chuckle)', '(giggle)'] },
  { key: 'handshake', label: '握手', frames: 61, shortcodes: ['(handshake)'] },
  { key: 'happy', label: '开心', frames: 69, shortcodes: ['(happy)'] },
  { key: 'headbang', label: '撞头', frames: 70, shortcodes: ['(banghead)', '(headbang)'] },
  { key: 'heart', label: '爱心', frames: 16, shortcodes: ['(heart)'] },
  { key: 'heidy', label: '松鼠', frames: 74, shortcodes: ['(squirrel)', '(heidy)'] },
  { key: 'hi', label: '挥手', frames: 56, shortcodes: ['(wave)', '(hi)'] },
  { key: 'highfive', label: '击掌', frames: 37, shortcodes: ['(highfive)'] },
  { key: 'hug', label: '熊抱', frames: 75, shortcodes: ['(bear)', '(hug)'] },
  { key: 'idea', label: '灵感', frames: 118, shortcodes: ['(idea)'] },
  { key: 'inlove', label: '恋爱了', frames: 62, shortcodes: ['(inlove)'] },
  { key: 'itwasntme', label: '不是我', frames: 75, shortcodes: ['(wasntme)'] },
  { key: 'kiss', label: '亲吻', frames: 59, shortcodes: ['(kiss)'] },
  { key: 'lalala', label: '啦啦啦', frames: 19, shortcodes: ['(lalala)'] },
  { key: 'lipssealed', label: '保密', frames: 49, shortcodes: ['(lipssealed)'] },
  { key: 'mail', label: '邮件', frames: 53, shortcodes: ['(mail)'] },
  { key: 'makeup', label: '化妆', frames: 107, shortcodes: ['(makeup)', '(kate)'] },
  { key: 'mmm', label: '嗯……', frames: 92, shortcodes: ['(mmmm)', '(mmm)', '(mm)'] },
  { key: 'mooning', label: '搞怪', frames: 45, shortcodes: ['(mooning)'] },
  { key: 'movie', label: '电影', frames: 54, shortcodes: ['(movie)', '(film)'] },
  { key: 'muscle', label: '肌肉', frames: 58, shortcodes: ['(muscle)', '(flex)'] },
  { key: 'music', label: '音乐', frames: 54, shortcodes: ['(music)'] },
  { key: 'nerd', label: '书呆子', frames: 47, shortcodes: ['(nerd)'] },
  { key: 'nickfury', label: '尼克·弗瑞', frames: 104, shortcodes: ['(nickfury)'] },
  { key: 'ninja', label: '忍者', frames: 121, shortcodes: ['(ninja)'] },
  { key: 'no', label: '不', frames: 54, shortcodes: ['(no)'] },
  { key: 'nod', label: '点头', frames: 50, shortcodes: ['(nod)'] },
  { key: 'oliver', label: '奥利弗', frames: 63, shortcodes: ['(oliver)'] },
  { key: 'party', label: '派对', frames: 70, shortcodes: ['(party)'] },
  { key: 'phone', label: '手机', frames: 88, shortcodes: ['(phone)', '(mp)', '(ph)'] },
  { key: 'pizza', label: '披萨', frames: 90, shortcodes: ['(pizza)', '(pi)'] },
  { key: 'poolparty', label: '泳池派对', frames: 87, shortcodes: ['(poolparty)'] },
  { key: 'puking', label: '呕吐', frames: 78, shortcodes: ['(puke)'] },
  { key: 'punch', label: '出拳', frames: 43, shortcodes: ['(punch)'] },
  { key: 'rain', label: '下雨', frames: 29, shortcodes: ['(london)', '(rain)', '(st)'] },
  { key: 'rock', label: '摇滚', frames: 11, shortcodes: ['(rock)'] },
  { key: 'rofl', label: '笑到打滚', frames: 80, shortcodes: ['(rofl)'] },
  { key: 'sadsmile', label: '伤心', frames: 62, shortcodes: ['(sad)'] },
  { key: 'shake', label: '发抖', frames: 50, shortcodes: ['(shake)'] },
  { key: 'sheep', label: '绵羊', frames: 110, shortcodes: ['(sheep)'] },
  { key: 'shielddeflect', label: '盾牌格挡', frames: 91, shortcodes: ['(shielddeflect)'] },
  { key: 'sleepy', label: '困了', frames: 71, shortcodes: ['(snooze)'] },
  { key: 'smile', label: '微笑', frames: 52, shortcodes: ['(smile)'] },
  { key: 'smirk', label: '得意', frames: 53, shortcodes: ['(smirk)'] },
  { key: 'smoking', label: '吸烟', frames: 64, shortcodes: ['(smoking)', '(smoke)', '(ci)'] },
  { key: 'speechless', label: '无语', frames: 66, shortcodes: ['(speechless)'] },
  { key: 'star', label: '星星', frames: 63, shortcodes: ['(star)'] },
  { key: 'sunshine', label: '太阳', frames: 26, shortcodes: ['(sun)'] },
  { key: 'surprised', label: '惊讶', frames: 67, shortcodes: ['(surprised)'] },
  { key: 'swear', label: '咒骂', frames: 76, shortcodes: ['(swear)'] },
  { key: 'sweating', label: '流汗', frames: 68, shortcodes: ['(sweat)'] },
  { key: 'talking', label: '说话', frames: 46, shortcodes: ['(talk)'] },
  { key: 'talktothehand', label: '别说了', frames: 61, shortcodes: ['(talktothehand)'] },
  { key: 'thinking', label: '思考', frames: 58, shortcodes: ['(think)'] },
  { key: 'time', label: '时间', frames: 59, shortcodes: ['(time)'] },
  { key: 'tmi', label: '信息太多', frames: 55, shortcodes: ['(tmi)'] },
  { key: 'toivo', label: '托伊沃', frames: 83, shortcodes: ['(toivo)'] },
  { key: 'tongueout', label: '调皮', frames: 48, shortcodes: ['(tongueout)'] },
  { key: 'tumbleweed', label: '风滚草', frames: 31, shortcodes: ['(tumbleweed)'] },
  { key: 'wait', label: '等一下', frames: 44, shortcodes: ['(wait)'] },
  { key: 'waiting', label: '等待中', frames: 50, shortcodes: ['(waiting)'] },
  { key: 'wfh', label: '居家办公', frames: 78, shortcodes: ['(wfh)'] },
  { key: 'whew', label: '松了口气', frames: 50, shortcodes: ['(relieved)', '(whew)'] },
  { key: 'wink', label: '眨眼', frames: 35, shortcodes: ['(wink)'] },
  { key: 'wondering', label: '疑惑', frames: 69, shortcodes: ['(wonder)'] },
  { key: 'worried', label: '担心', frames: 55, shortcodes: ['(worried)'] },
  { key: 'wtf', label: '什么情况？', frames: 56, shortcodes: ['(wtf)'] },
  { key: 'yawning', label: '打哈欠', frames: 73, shortcodes: ['(yawn)'] },
  { key: 'yes', label: '是的', frames: 39, shortcodes: ['(yes)', '(ok)'] },
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
