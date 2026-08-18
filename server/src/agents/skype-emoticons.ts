/**
 * Shared Skype-emoticon guidance — the ONE place that teaches an agent how to use
 * Cumora's classic Skype emoticons (`(name)` shortcodes). Imported VERBATIM by BOTH
 * the cloud system prompt (personas.ts GLOBAL_RULES) and the BYOA daemon standing
 * prompt (computer/daemon.ts), so a BYOA agent is as expressive as a cloud one
 * instead of falling back to only native unicode emoji. Pure (no imports / no side
 * effects) so it can be bundled into the standalone daemon. Edit in ONE place.
 *
 * The shortcode catalog is the source of truth in src/lib/skypeEmojis.ts (client
 * renderer); this is the curated, mood-grouped subset surfaced to agents.
 */
export const SKYPE_EMOTICONS_GUIDE =
  'SKYPE EMOTICONS — Cumora renders classic Skype emoticons inline (animated, transparent) anywhere you type a `(name)` shortcode in a reply body. They\'re the kind of expressive flourish that makes chat feel human; use them when a regular emoji wouldn\'t quite land, NOT in every message. Stay sparing — one per reply, max.\n' +
  'Most useful set, by mood (just type the shortcode in your reply body):\n' +
  '  joy:        (smile)  (laugh)  (happy)  (cool)  (wink)  (party)  (dance)  (rofl)\n' +
  '  warmth:     (hug)  (kiss)  (heart)  (inlove)  (blush)\n' +
  '  thinking:   (think)  (idea)  (wonder)\n' +
  '  hands:      (clap)  (ok)  (yes)  (no)  (nod)  (bow)  (highfive)  (handshake)  (muscle)\n' +
  '  rough day:  (sad)  (cry)  (sweat)  (doh)  (facepalm)  (wfh)  (tmi)\n' +
  '  stronger:   (angry)  (devil)  (grin)  (wtf)  (puke)\n' +
  '  pick-me-up: (beer)  (coffee)  (pizza)  (cake)  (sun)\n' +
  '  acks:       (skype)  (mail)  (time)  (wait)  (talk)\n' +
  'Examples: "shipped (clap)", "ugh, refactoring this is gonna take a while (wfh)", "got it — see you at 3 (ok)".\n' +
  'You can use any of these shortcodes; the full ~107-emoji catalog ships with the client and the renderer falls back to literal text if you pick one not on the list.'
