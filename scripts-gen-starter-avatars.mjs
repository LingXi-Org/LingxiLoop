#!/usr/bin/env node
/**
 * One-off generator for the four starter-agent default portraits
 * (public/starter-avatars/{atlas,iris,bram,nova}.png).
 *
 * These are the four agents auto-seeded into every new company by
 * server/src/onboardCompany.ts. By baking their portraits in as static
 * defaults, fresh workspaces no longer have to wait on (or pay for) an
 * image-gen call before the starter team has a face.
 *
 * The prompt + visual signature are an EXACT mirror of
 * `generateAndPersistAvatar` (server/src/api/router.ts) — same agent ids
 * feed into the same FNV-1a hash → same pools → same prompt text. If
 * later the user hits the /agents/:id/avatar/regen path on a starter,
 * they get a visually-consistent re-roll of the same character.
 *
 * Gender presentation: hardcoded here (rather than reproducing the LLM
 * classifier) so the offline run is deterministic. Values match what
 * inferAgentGender's own prompt examples specify (Atlas/Bram →
 * masculine; Iris → feminine) plus Nova → feminine (confirmed with
 * the user — gives the 4-pack 2-and-2 balance).
 *
 * Run once, commit the four PNGs:
 *
 *   node scripts-gen-starter-avatars.mjs
 *
 * Re-run only if the prompt logic or starter roster intentionally
 * changes. Don't re-run on autopilot — these images are meant to be
 * stable defaults.
 */
import 'dotenv/config'
import OpenAI from 'openai'
import { writeFile, mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(HERE, 'public/starter-avatars')

const apiKey = process.env.OPENAI_API_KEY
if (!apiKey) {
  console.error('OPENAI_API_KEY not set — load it from your .env first.')
  process.exit(1)
}

/* ============== Mirror of server/src/api/router.ts ============== */

// FNV-1a — must match hashStr() in router.ts exactly.
function hashStr(s) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h = ((h ^ s.charCodeAt(i)) >>> 0)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

function pickFromHash(arr, h, salt) {
  return arr[((h ^ salt) >>> 0) % arr.length]
}

// Exact copy of VISUAL_DIMENSIONS from server/src/api/router.ts. Keep these
// in sync if the server-side pools are revised.
const VISUAL_DIMENSIONS = {
  age: ['21', '22', '22', '23', '23', '24', '24', '25', '25', '26', '26', '27', '28', '29', '31', '32'],
  presentationFeminine: [
    'feminine, softly pretty face with large clear eyes and a small refined nose',
    'feminine, soft heart-shaped face with full pink lips and bright doe eyes',
    'feminine, delicate youthful features with rounded soft cheeks',
    'feminine, doll-like proportions with large expressive eyes and a small chin',
    'feminine, gently pretty face with high cheekbones and a graceful neck',
    'feminine, sweet feminine features with full soft lips and clear bright eyes',
    'feminine, classically pretty youthful face, soft jaw and big warm eyes',
  ],
  presentationMasculine: [
    'masculine, striking refined features with deep clear eyes',
    'masculine, soft handsome face with a strong nose and full lashes',
    'masculine, sharp jaw and high cheekbones, a face with quiet intensity',
    'masculine, refined gentle features with a clear thoughtful gaze',
    'masculine, model-grade proportions with a defined brow',
    'masculine, slim refined face with expressive dark eyes',
    'masculine, soft features with full lips and a kind direct gaze',
  ],
  presentationAndrogynous: [
    'gentle androgynous beauty, soft refined features with a warm clear gaze',
    'softly androgynous, delicate features with deep expressive eyes',
    'softly androgynous, balanced symmetrical features and a kind direct gaze',
    'softly androgynous, refined youthful face with full lashes and a small nose',
    'softly androgynous, pretty refined features with a gentle calm expression',
  ],
  skin: [
    'fair porcelain with a faint pink undertone',
    'fair porcelain with a faint pink undertone',
    'cool ivory',
    'cool ivory',
    'warm cream',
    'warm cream',
    'soft beige',
    'soft beige',
    'golden olive',
    'warm tan',
    'sun-warmed honey',
    'rich olive',
  ],
  hairColor: [
    'raven black with a blue undertone',
    'soft espresso brown',
    'warm chestnut with copper highlights',
    'deep auburn',
    'honey blonde',
    'icy platinum',
    'cool ash brown',
    'fiery copper red',
    'jet black with one bleached blonde streak in front',
    'mossy dark green dyed tint',
    'warm caramel blonde',
    'inky black with bluntly chopped fringe',
    'soft pastel-pink ends fading into natural brown',
  ],
  hairStyleFeminine: [
    'long soft waves falling over one shoulder',
    'a chin-length soft bob with a gentle inward curl',
    'shoulder-length and softly tousled, parted in the middle',
    'long, almost-waist-length and gathered loosely over the shoulder',
    'a single low ponytail with face-framing strands',
    'a wide halo of natural curls, framing the face softly',
    'long box braids gathered into a low feminine bun',
    'wavy hair tucked behind one ear, falling past the shoulder',
    'a soft half-up topknot with the rest falling in waves',
    'long straight hair with a soft curtain fringe',
    'a sweet bob with side-swept fringe just brushing the chin',
    'a low chignon with delicate face-framing wisps',
  ],
  hairStyleMasculine: [
    'soft tousled hair brushed casually forward',
    'an undercut with a long textured top swept to one side',
    'tight coils cropped close to the scalp, sharp hairline',
    'a clean tapered fade with a coiled crown',
    'medium-length hair tucked loosely behind the ears',
    'short waves with natural volume on top',
    'a soft fringe sweeping across the forehead',
    'a chin-length mullet, soft and modern',
    'shoulder-length wavy hair, free and loose',
    'a sharp shape-up with refined natural texture on top',
  ],
  hairStyleAndrogynous: [
    'shoulder-length and tucked loosely behind the ears',
    'a soft chin-length bob with a center part',
    'medium-length tousled hair with a gentle curtain fringe',
    'shoulder-length wavy hair, free and loose',
    'a soft mid-length cut brushed casually back',
    'collarbone-length straight hair with a blunt soft fringe',
  ],
  signature: [
    'a small beauty mark just under the left eye',
    'a constellation of light freckles across the nose and cheekbones',
    'a single dimple on the left cheek that shows when smiling',
    'long curling eyelashes that catch light',
    "a soft cupid's-bow on the upper lip",
    'an asymmetric raised eyebrow at rest, full of personality',
    'a small mole at the corner of the mouth',
    'a faint natural blush at the apples of the cheeks',
    'plush soft lips with a gentle natural shape',
    'a small delicate gold stud earring',
    'a soft pink flush across the cheeks and nose bridge',
    'a sweet softly rounded chin',
  ],
  glasses: ['no glasses', 'thin gold wire-frames worn low on the bridge', 'small round John-Lennon-style wire-frames', 'narrow rectangular tortoiseshell frames', 'no glasses', 'oversized rounded clear-acetate frames', 'no glasses', 'thin matte-black wire-frames', 'reading glasses pushed up into the hair', 'no glasses'],
  accessory: [
    'a single small gold stud earring on one ear',
    'a delicate silver chain holding a small charm',
    'a thin silk scarf knotted loosely at the neck',
    'no notable accessory',
    'a knit beanie pushed back from the forehead',
    'a graphite pencil tucked behind one ear',
    'no notable accessory',
    'a slim leather watch peeking from a sleeve',
    'an asymmetric pair of small hoop earrings',
    'a tiny enamel pin shaped like a pear on the collar',
    'a piece of red yarn wrapped twice around the wrist',
    'a single oversized ring on the index finger',
  ],
  wardrobeFeminine: [
    'a soft pastel-pink cardigan with pearl buttons over a fine white tee',
    'a butter-yellow puff-sleeve blouse, fresh and playful',
    'a sweet cream knit with a delicate scalloped neckline',
    'a soft lavender blouse with a small ribbon bow at the collar',
    'a pretty floral-print summer dress with a soft round neckline',
    'a fitted ribbed sage-green knit top with cap sleeves',
    'a delicate white blouse with lace trim at the collar',
    'a soft baby-blue cardigan over a pretty camisole',
    'a fresh peach-pink puff-sleeve top, sweet and youthful',
    'a clean white blouse with a pussy-bow tie at the neck',
    'a soft cream off-shoulder knit, gently feminine',
    'a pretty pleated lavender dress with a fitted bodice',
    'a soft yellow sundress with thin straps and a sweetheart neckline',
    'a pretty pastel-pink ribbed knit with a delicate scoop neck',
  ],
  wardrobeMasculine: [
    'a soft cream knit sweater over a clean white tee, fashion-student feel',
    'a vintage band tee under an unbuttoned plaid overshirt',
    'a clean white oxford with the sleeves rolled up to the elbow',
    'a soft cropped vintage leather jacket over a clean tee',
    'a structured navy blazer over a fine white tee, sharp and modern',
    'a sage linen shirt with the top buttons casually open',
    'a cropped corduroy jacket over a black turtleneck',
    'a fitted black turtleneck, minimalist and clean',
    'a relaxed-fit white t-shirt under a soft denim chore jacket',
    'a soft camel cashmere cardigan over a fine ribbed tee',
    'a vintage Breton stripe top, classic and cool',
    'a fresh light-blue oxford with the collar relaxed',
  ],
  wardrobeAndrogynous: [
    'a soft oversized cream knit, minimalist and modern',
    'a soft camel cashmere cardigan over a fine ribbed tee',
    'a clean white oxford with the collar slightly relaxed',
    'a sage linen shirt with the top buttons casually open',
    'a soft beige sweatshirt with a relaxed neckline',
    'an oversized chambray shirt worn loose, effortlessly cool',
    'a fine fawn merino crewneck over a thin white tee',
  ],
  artStyle: [
    'soft watercolor portrait on heavy cotton paper, visible grain, gentle pencil under-drawing showing through, restrained brushwork',
    'crisp ink-line illustration with translucent gouache washes, magazine-cover feel, hand-lettered sensibility',
    'mid-century editorial illustration, geometric and graphic, flat shading with two or three accent colors, vintage Saul Bass / Paul Rand energy',
    'risograph-style portrait, two-color halftone (terracotta and slate), slight registration offset, pulpy paper texture',
    'oil painting feel with visible brush direction, soft impasto on the cheekbones, refined classical portrait sensibility',
    'pencil drawing with subtle digital color washes, photorealistic linework, almost monochrome with one warm color accent',
    'modern digital editorial portrait, flat color shapes with one rim-light, very pared-back, contemporary brand-illustration style',
    'soft chalk pastel on tinted paper, smudgy edges, gentle warmth, slightly impressionistic',
    'pen-and-ink line drawing with NO color, fine cross-hatching, archival-portrait sensibility',
    'gentle gouache with deliberate visible brush strokes, slightly naive proportions, contemporary picture-book sensibility',
  ],
  background: [
    'warm beige paper with subtle grain',
    'soft sage with a hint of paper texture',
    'pale terracotta gradient',
    'cool slate with paper grain',
    'cream with subtle warm texture',
    'soft peach wash',
    'muted lavender mist',
    'matte off-white',
    'warm cinnamon haze',
    'pale ochre with grain',
    'dusty teal flat color',
    'deep plum behind a soft halo of light',
  ],
  vibe: [
    'mid-laugh, eyes crinkling into a real smile',
    'a playful smirk just starting at the corner of the mouth',
    'quietly amused, eyes nearly closing into a smile',
    'bright open joy, head tilted with delight',
    'a knowing grin, eyes alive with mischief',
    'caught mid-thought with a small private smile',
    'warm and engaged, eyes catching the viewer',
    'cool confidence with a slight raised eyebrow, charming and direct',
    'a delighted laugh frozen mid-moment, teeth showing',
    'sweet shy smile, eyes meeting the camera then glancing away',
    'about-to-say-something energy, lips just parting',
    'a soft chic smile with sparkle in the eyes',
  ],
  headAngle: [
    'three-quarter angle to the left, head tilted with curiosity, gaze meeting the camera',
    'three-quarter angle to the right, mid-turn as if just noticed something',
    'nearly frontal with a playful head tilt and a soft smile',
    'looking back over the shoulder with a quick warm glance',
    'leaning forward a little, elbows implied, fresh open gaze',
    'head tipped slightly back in mid-laugh, eyes crinkled',
    'almost-frontal, head cocked to the side with a small smile',
    'caught looking up from below with a bright surprised expression',
    'three-quarter angle, hand-near-chin pose, thinking-but-amused',
    'profile turning toward the camera with a soft natural smile',
  ],
}

function visualSignatureFor(agentId, gender) {
  const h = hashStr(agentId)
  const presentationPool = gender === 'feminine' ? VISUAL_DIMENSIONS.presentationFeminine
    : gender === 'masculine' ? VISUAL_DIMENSIONS.presentationMasculine
    : VISUAL_DIMENSIONS.presentationAndrogynous
  const hairStylePool = gender === 'feminine' ? VISUAL_DIMENSIONS.hairStyleFeminine
    : gender === 'masculine' ? VISUAL_DIMENSIONS.hairStyleMasculine
    : VISUAL_DIMENSIONS.hairStyleAndrogynous
  const wardrobePool = gender === 'feminine' ? VISUAL_DIMENSIONS.wardrobeFeminine
    : gender === 'masculine' ? VISUAL_DIMENSIONS.wardrobeMasculine
    : VISUAL_DIMENSIONS.wardrobeAndrogynous
  return {
    age:          pickFromHash(VISUAL_DIMENSIONS.age,          h, 0x9E3779B9),
    presentation: pickFromHash(presentationPool,               h, 0x85EBCA6B),
    skin:         pickFromHash(VISUAL_DIMENSIONS.skin,         h, 0xC2B2AE35),
    hairColor:    pickFromHash(VISUAL_DIMENSIONS.hairColor,    h, 0x27D4EB2F),
    hairStyle:    pickFromHash(hairStylePool,                  h, 0x165667B1),
    signature:    pickFromHash(VISUAL_DIMENSIONS.signature,    h, 0x3A4F1B7D),
    glasses:      pickFromHash(VISUAL_DIMENSIONS.glasses,      h, 0xD8163841),
    accessory:    pickFromHash(VISUAL_DIMENSIONS.accessory,    h, 0xA1B5E5A7),
    wardrobe:     pickFromHash(wardrobePool,                   h, 0x53C5DA4D),
    artStyle:     pickFromHash(VISUAL_DIMENSIONS.artStyle,     h, 0xB7E15162),
    background:   pickFromHash(VISUAL_DIMENSIONS.background,   h, 0x6F4A7E13),
    vibe:         pickFromHash(VISUAL_DIMENSIONS.vibe,         h, 0xE9B5DBE1),
    headAngle:    pickFromHash(VISUAL_DIMENSIONS.headAngle,    h, 0xCB1AB31F),
    gender,
  }
}

// Mirror of generateAndPersistAvatar's prompt builder. Two differences from
// the server: (1) gender is hardcoded — see header note for why; (2) the
// styleHint comes from STARTER_TEAM's systemPrompt slice rather than a DB
// read. Output text is otherwise byte-identical for matching inputs.
function buildPrompt({ name, role, systemPrompt, id, gender }) {
  const styleHint = (systemPrompt ?? '').slice(0, 500)
  const visual = visualSignatureFor(id, gender)
  const genderClause = gender === 'feminine'
    ? `${name} is a young woman with softly feminine features and styling — a pretty face, gentle expression, distinctly girlish attire (a dress, soft blouse, pastel knit, or similarly feminine piece). Long or shoulder-length soft hair.`
    : gender === 'masculine'
      ? `${name} is a young man with clearly masculine features and presentation.`
      : `${name}'s gender presentation is intentionally androgynous and refined.`
  return [
    `Draw ${name} — a young, striking, characterful individual. Beautiful in a distinctive, interesting way (not a generic "model type", not a "professional headshot"). The kind of person you'd notice in a coffee shop because their face has personality. Caught in a candid, playful moment — alive and engaged with the world, not posing stiffly. ${genderClause}`,
    '',
    `Who ${name} is, physically and personality-wise. EVERY detail below is required and must be visible in the portrait:`,
    `• Apparent age: ${visual.age} years old (look this age, no younger, no older)`,
    `• Build / presentation: ${visual.presentation}`,
    `• Skin: ${visual.skin}`,
    `• Hair: ${visual.hairStyle} — colored ${visual.hairColor}`,
    `• A distinctive feature: ${visual.signature}  ← include this clearly`,
    `• Eyewear: ${visual.glasses}`,
    `• Wearing: ${visual.wardrobe}`,
    `• Accessory: ${visual.accessory}`,
    '',
    `Pose & emotional tone (matters as much as the face):`,
    `• Framing: ${visual.headAngle}`,
    `• Vibe right now: ${visual.vibe}`,
    role ? `• Their role: ${role}` : '',
    styleHint ? `• Inner essence the face should hint at: ${styleHint.slice(0, 240)}` : '',
    '',
    `RENDER STYLE — important, this is what gives the portrait its distinct artistic identity (do NOT default to a "minimalist editorial" baseline):`,
    `${visual.artStyle}.`,
    `Background: ${visual.background}.`,
    '',
    `Skin finish — NATURAL, not oily:`,
    `- Skin should look like real human skin in honest light. Not shiny, not wet, not "glass-skin", not airbrushed. A real complexion with subtle texture.`,
    `- No makeup highlighter, no glossy lip highlights, no contouring. Brows and lashes natural, eyes alive on their own.`,
    `- Hair has a normal soft texture — no gel, no wet-look, no shellac.`,
    `- Tactile texture of the medium (paper grain, brushwork) belongs in the BACKGROUND and clothing, not as bright highlights on the face.`,
    '',
    'Hard rules:',
    '- Single subject, head-and-shoulders, square frame, head centered so a circular crop works.',
    `- This is ${name}, not a stand-in. Lean hard into the specific features above; do not soften them toward an average.`,
    `- The portrait MUST read as YOUNG (early 20s to early 30s) — never 35+, never "weathered", never "lived-in". If the face looks middle-aged, you have failed.`,
    `- The pose must feel ALIVE and CANDID — caught mid-moment, with motion or personality. Never stiff, never "official headshot", never "model gaze".`,
    `- Beautiful but DISTINCTIVE — striking features, real personality. Avoid generic "average attractive face".`,
    `- Respect the gender presentation above; do not contradict it.`,
    '- No text. No logos. No background figures. No stock-photo realism. No anime / chibi / exaggerated cartoon. No sultry / smoldering / "Tom Ford" glamour.',
    '- The portrait should feel like it was drawn for a profile in a magazine that cares deeply about who this person is — Refinery29 / Vice / Kinfolk / Cereal magazine youth-feature energy.',
  ].filter(Boolean).join('\n')
}

/* ============== Starter roster — keep in sync with onboardCompany.ts ============== */

const STARTERS = [
  {
    id: 'atlas', name: 'Atlas', role: 'Researcher', gender: 'masculine',
    systemPrompt: 'You are Atlas — a researcher who connects threads other people miss. You read carefully, cite sources, and prefer to "let me check that" over confident guessing. When you have evidence, state it cleanly with a quoted snippet; when you don\'t, say so. You ask the question that everyone else assumed had been answered.',
  },
  {
    id: 'iris', name: 'Iris', role: 'Designer', gender: 'feminine',
    systemPrompt: 'You are Iris — a designer with strong taste and a soft tongue. You see the difference between "fine" and "right" and you can articulate it in one sentence. You push back on visual decisions that lose meaning, but you bring an alternative when you do. You sketch, you propose, you don\'t lecture.',
  },
  {
    id: 'bram', name: 'Bram', role: 'Engineer', gender: 'masculine',
    systemPrompt: 'You are Bram — an engineer who is allergic to vague specs and cargo-cult complexity. You think in tradeoffs and call them out plainly: "this works but adds 12kb"; "we could but it locks us into X". You write clear short reasoning, not paragraphs. When something is broken you say what you actually saw, not what should be true.',
  },
  {
    id: 'nova', name: 'Nova', role: 'Product Manager', gender: 'feminine',
    systemPrompt: 'You are Nova — a PM who keeps the team unstuck. You ask the question that makes the choice obvious. You hate scope creep but you love clarity. When the conversation drifts you name the drift; when nobody is making the call, you propose one and ask "objections?". Concise. Decisive when others are not.',
  },
]

/* ============== Main ============== */

const client = new OpenAI({ apiKey })
const model = process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2'

await mkdir(OUT_DIR, { recursive: true })
console.log(`→ output: ${OUT_DIR}`)
console.log(`→ model:  ${model}`)
console.log('')

for (const a of STARTERS) {
  const prompt = buildPrompt(a)
  console.log(`[${a.id}] generating (this takes ~30s)…`)
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
    const fetched = await fetch(remoteUrl)
    buf = Buffer.from(await fetched.arrayBuffer())
  } else {
    console.error(`[${a.id}] image API returned no data — skipping`)
    continue
  }
  const out = resolve(OUT_DIR, `${a.id}.png`)
  await writeFile(out, buf)
  console.log(`[${a.id}] ✓ wrote ${out} (${buf.length} bytes)`)
}

console.log('')
console.log('done. commit public/starter-avatars/*.png.')
