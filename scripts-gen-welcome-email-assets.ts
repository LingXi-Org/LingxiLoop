#!/usr/bin/env node
/**
 * One-off generator for the welcome-email static assets.
 *
 *   ./node_modules/.bin/tsx scripts-gen-welcome-email-assets.ts
 *
 * Produces TWO objects on R2 at deterministic, unsigned keys so the URLs
 * never expire (`email/` isn't in storage.ts SIGNED_PREFIXES):
 *
 *   email/welcome-hero.png   ← 1536x1024 painterly cloudscape, GPT-Image-2
 *   email/logo.png           ← mirror of public/logo.png for inline use
 *
 * The welcome-mail helper in server/src/admin.ts builds URLs as
 *   `${R2_PUBLIC_BASE}/email/welcome-hero.png`
 * and embeds them in the HTML body, so re-running this script silently
 * updates the artwork everyone receives going forward (no DB write, no
 * env-var rotation, CDN cache the only thing to worry about).
 *
 * Re-run when:
 *   - you want a new hero (rare)
 *   - you change public/logo.png and want the email to match
 *
 * Pre-reqs (read from .env at repo root):
 *   OPENAI_API_KEY              — for the image-gen call
 *   R2_ENDPOINT, R2_BUCKET,
 *   R2_ACCESS_KEY_ID,
 *   R2_SECRET_ACCESS_KEY,
 *   R2_PUBLIC_BASE              — for the upload + URL resolution
 */
import 'dotenv/config'
import OpenAI from 'openai'
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { storage } from './server/src/storage.js'

const HERE = dirname(fileURLToPath(import.meta.url))

const apiKey = process.env.OPENAI_API_KEY
if (!apiKey) {
  console.error('OPENAI_API_KEY not set — load it from your .env first.')
  process.exit(1)
}
if (storage.mode !== 'r2') {
  console.error('Storage is in LOCAL mode — set R2_* env vars so the URLs are CDN-served.')
  process.exit(1)
}

const client = new OpenAI({ apiKey })
const model = process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2'

/* ============== Hero prompt ==============
 *
 * Goal: an atmospheric brand banner for a software product called
 * Cumora. The name nods to cumulus → clouds; the brand palette is sky
 * blue + dusty wisteria purple + warm coral + cream paper. Tone is
 * "an elegant, contemplative place where small teams quietly gather".
 *
 * Anti-goals: no characters, no UI mockups, no literal text on the
 * canvas, no harsh corporate stock-art gradients, no logos. */
const HERO_PROMPT = `A serene wide-cinematic hero illustration for a software product named Cumora — a calm place where small teams of thinkers gather.

Subject: a painterly cloudscape at the soft hour between dawn and morning. Layered cumulus clouds drift across an expansive sky in slow, sculptural formations. The horizon is barely visible, dissolving into mist. The composition has depth — distant clouds smaller and cooler, foreground clouds larger and warmer-lit — drawing the eye into the scene.

Color palette, anchor exactly:
  • brand sky blue #00A8F0 fading into pale sky #E1F3FD across the upper register
  • dusty wisteria purple #7B6CB0 transitioning to soft lilac #ECE7F5 in the mid-clouds
  • a faint warm glow of coral #FFD9D2 at the horizon, like first light catching a cloud edge
  • creamy paper #FAFCFE in the brightest highlights
Avoid neon, avoid pure saturation — every color is slightly desaturated, painterly, watercolor-soft.

Style: painterly gouache with watercolor washes, gentle volumetric light, soft volumetric edges with no hard rendering. Subtle film grain. Slight directional light from the upper right, casting long soft shadows on the underside of clouds. References: Studio Ghibli pastel skies (Castle in the Sky / Howl's Moving Castle), James Jean cloud studies, Tomer Hanuka pastel atmospherics.

Strict negative constraints: no people, no faces, no characters, no animals, no birds, no airplanes, no architecture, no buildings, no logos, no text, no letters, no UI elements, no product mockups, no screens. Pure landscape — just sky and cloud.

Mood: hopeful, welcoming, contemplative, refined. The kind of image you'd want to look at for a long time.`

interface ImageGenResult {
  data?: Array<{ b64_json?: string; url?: string }>
}

async function generateHero(): Promise<Buffer> {
  console.log(`[hero] generating via ${model} (this can take ~45s)…`)
  const t0 = Date.now()
  const r = await client.images.generate({
    model,
    prompt: HERO_PROMPT,
    size: '1536x1024',
    n: 1,
  }) as ImageGenResult
  const first = r.data?.[0]
  if (!first) throw new Error('image API returned no data')
  if (first.b64_json) {
    const buf = Buffer.from(first.b64_json, 'base64')
    console.log(`[hero] ✓ generated ${buf.length} bytes (${Date.now() - t0} ms, b64)`)
    return buf
  }
  if (first.url) {
    const fetched = await fetch(first.url)
    const buf = Buffer.from(await fetched.arrayBuffer())
    console.log(`[hero] ✓ generated ${buf.length} bytes (${Date.now() - t0} ms, remote URL)`)
    return buf
  }
  throw new Error('image API returned neither b64 nor url')
}

async function main(): Promise<void> {
  // 1. Mirror the logo. Deterministic path means the email always points at
  //    a fresh copy if public/logo.png is updated and this script re-run.
  const logoPath = resolve(HERE, 'public/logo.png')
  const logoBuf = await readFile(logoPath)
  const logoUrl = await storage.put('email/logo.png', logoBuf, 'image/png')
  console.log(`[logo] ✓ uploaded ${logoBuf.length} bytes → ${logoUrl}`)

  // 2. Generate + upload the hero. Each re-run paints a fresh sky.
  const heroBuf = await generateHero()
  const heroUrl = await storage.put('email/welcome-hero.png', heroBuf, 'image/png')
  console.log(`[hero] ✓ uploaded ${heroBuf.length} bytes → ${heroUrl}`)

  console.log('')
  console.log('done. The welcome email helper will pick these up automatically — no env-var changes needed.')
  console.log('CDN may cache the old version briefly; force-refresh in Resend preview if you want to see the new one immediately.')
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1) })
