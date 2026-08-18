// One-shot: generate a cuter, more textured Cumora app icon and save to build/icon.png.
// Backs up the existing PNG to build/icon.prev.png before overwriting.
import OpenAI from 'openai'
import { writeFile, copyFile, access } from 'node:fs/promises'

const apiKey = process.env.OPENAI_API_KEY
if (!apiKey) { console.error('OPENAI_API_KEY missing'); process.exit(1) }

const PROMPT = `App icon mark for "Cumora" — a chat app where AI agents and humans gather. CUTE, tactile, refined. The character must FLOAT freely on a fully transparent background with NO container, NO frame, NO border, NO rounded square, NO outline, NO drop-shadow plate. The host platform (macOS, browsers) supplies its own rounded-square mask later; the icon SOURCE has zero visible edge.

Subject: a friendly, rounded cloud character — gently dimensional, like a soft plush toy or claymation. TWO small round glossy eyes (just soft highlights, kind & calm). A subtle softly-curved smile is optional. Tiny rounded curls of cloud at the base hint at floating.

Around it, TWO smaller floating bubble companions at different heights — these read as "voices around it", like friends. One bubble in matching sky-blue; ONE warm peach/cream accent bubble for emotional warmth. Vary sizes for rhythm.

Style:
- Soft 3D / claymation render, not flat vector. Subsurface-scattering feel — light passes gently through the cloud's edges.
- Soft specular highlights, subtle matte texture (not glossy plastic).
- Palette: cloud body soft white-blue gradient (whitest at top-left fading to calm sky blue at bottom). Companion bubble in matching sky blue. Accent bubble in soft peach/cream.
- The character + bubbles fill ~80% of the canvas, centered, with breathing room. Readable at 32×32px.

HARD rules:
- Background: 100% TRANSPARENT (alpha = 0). NO backdrop, NO plate, NO card, NO halo, NO shadow plate, NO rounded rectangle behind anything.
- No text, no letters, no numbers, no logos.
- Sharp focus, single subject, no anime / chibi big-eyes / sticker / generic UI flat-illustration.
- Beloved indie creative-tool icon energy — confidence, warmth, restraint, charm.`

async function main() {
  const client = new OpenAI({ apiKey })
  console.log('[icon] generating with model gpt-image-2 …')
  const r = await client.images.generate({
    model: process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2',
    prompt: PROMPT,
    size: '1024x1024',
    n: 1,
    // Force a true alpha-transparent PNG so there's no rendered backdrop /
    // black hairline / pale-blue plate baked into the source.
    background: 'transparent',
    output_format: 'png',
  })
  const first = r.data?.[0]
  const b64 = first?.b64_json
  const url = first?.url
  let buf
  if (b64) buf = Buffer.from(b64, 'base64')
  else if (url) {
    const res = await fetch(url)
    buf = Buffer.from(await res.arrayBuffer())
  } else { console.error('no image returned'); process.exit(2) }

  // Back up existing icon if present
  try {
    await access('build/icon.png')
    await copyFile('build/icon.png', 'build/icon.prev.png')
    console.log('[icon] backed up old icon → build/icon.prev.png')
  } catch { /* no existing */ }

  await writeFile('build/icon.png', buf)
  console.log(`[icon] wrote build/icon.png (${buf.length} bytes)`)
}

main().catch((e) => { console.error(e); process.exit(3) })
