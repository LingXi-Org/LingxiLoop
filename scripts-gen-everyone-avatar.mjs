#!/usr/bin/env node
/**
 * One-off generator for the `@all` mention picker portrait
 * (public/everyone.png).
 *
 * The picker shows agent avatars as warm, painterly editorial portraits;
 * pairing them with a flat line icon for "Everyone" looked off. This
 * script generates a portrait that lives in the same visual family — a
 * small intimate cluster of three subjects, painterly gouache, the same
 * coral / cream palette as the chip background — so the Everyone row
 * stops feeling like a foreign element in the dropdown.
 *
 * Run once, commit the output:
 *
 *   node scripts-gen-everyone-avatar.mjs
 *
 * Re-run only if the prompt or aesthetic intentionally changes. Don't
 * re-run on autopilot — the asset is meant to be stable.
 */
import 'dotenv/config'
import OpenAI from 'openai'
import { writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(HERE, 'public/everyone.png')

const apiKey = process.env.OPENAI_API_KEY
if (!apiKey) {
  console.error('OPENAI_API_KEY not set — load it from your .env first.')
  process.exit(1)
}

// Prompt designed to slot into the existing agent-portrait family
// (see server/src/api/router.ts:generateAndPersistAvatar for that prompt).
// Key constraints: editorial-illustration style (NOT photo-real), painterly
// brushwork, warm coral/cream palette, square frame, head-and-shoulders
// composition that crops cleanly to a circle, NO text/logos.
const prompt = [
  `Editorial portrait illustration of a small intimate cluster of three young people — heads and shoulders only, faces tilted toward each other as if listening to a shared moment. A community gathered close, the visual language of "everyone here, together". Diverse appearances, distinct individuals but their attention shared.`,
  '',
  `Style: hand-painted gouache + watercolor, magazine portrait aesthetic — Refinery29 / Vice / Kinfolk / Cereal magazine youth-feature energy. Soft visible brushwork, characterful linework, the same illustrated family as a hand-illustrated profile feature. NOT photo-real, NOT 3D-render, NOT anime.`,
  '',
  `Palette: warm and inviting — coral, peach, cream, soft amber, dusty rose. Background a soft warm wash (cream / very pale coral). The whole thing should feel like one continuous warm illustration, not high-contrast.`,
  '',
  `Composition: square frame, subjects centered and roughly equally weighted so a circular crop (head and shoulders ring) reads cleanly — no critical detail at the corners. The three figures overlap gently; one slightly forward, two slightly behind/beside.`,
  '',
  `Hard rules:`,
  `- No text, no logos, no labels, no speech bubbles, no megaphone or other "broadcast" props — the meaning ("everyone") comes from the gathered group, not from on-the-nose symbols.`,
  `- No background figures beyond the three. No environment detail.`,
  `- Skin natural, not oily / not glossy. Real complexions in honest light.`,
  `- Faces beautiful in a distinctive, characterful way — not generic "model" types. The kind of people you'd notice in a cafe because their faces have personality.`,
  `- Each subject reads as YOUNG (early 20s to early 30s).`,
  `- Hairstyles and clothing varied across the three, in keeping with the warm palette.`,
  `- Mood: warm, attentive, gentle — the moment everyone leans in to listen.`,
].join('\n')

const client = new OpenAI({ apiKey })
const model = process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2'

console.log(`→ generating with ${model} (this takes ~30s)…`)
const r = await client.images.generate({
  model,
  prompt,
  size: '1024x1024',
  n: 1,
})

const first = r.data?.[0]
const b64 = first?.b64_json
const remoteUrl = first?.url
let buf
if (b64) {
  buf = Buffer.from(b64, 'base64')
} else if (remoteUrl) {
  // Older API variants return a temporary URL instead of inline base64.
  const fetched = await fetch(remoteUrl)
  buf = Buffer.from(await fetched.arrayBuffer())
} else {
  console.error('image API returned no data')
  process.exit(2)
}

await writeFile(OUT, buf)
console.log(`✓ wrote ${OUT} (${buf.length} bytes)`)
