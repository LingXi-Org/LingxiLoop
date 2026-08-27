import { randomUUID, } from 'node:crypto'
import { Router } from 'express'
import { pool } from '../../db/pool.js'
import { env } from '../../env.js'
import { requireCompanyRole } from '../../http/authorization.js'
import { HttpError } from '../../http/errors.js'
import { assertCompanyAgentLimit, requireAuth, requireCompany, requireCompanyArtifactContext } from '../../http/request-context.js'
import { assertNotManagedPulse, assertPulseVisible } from '../../learning/visibility.js'
import { BUSY_STATUS_LEASE_MS } from '../../status.js'
import { storage, } from '../../storage.js'

export const agentsServiceRoutes = Router()
const api = agentsServiceRoutes

api.get('/participants', async (req, res) => {
  const { userId: me, companyId: tenant, projectId } = await requireCompanyArtifactContext(req)
  await pool.query(
    `UPDATE participants
        SET status = 'avail',
            status_updated_at = NOW()
      WHERE company_id = $1
        AND kind = 'agent'
        AND departed_at IS NULL
        AND status IN ('thinking', 'working', 'waiting')
        AND status_updated_at < NOW() - ($2::int * INTERVAL '1 millisecond')`,
    [tenant, BUSY_STATUS_LEASE_MS],
  )
  const { rows } = await pool.query<{
    id: string; kind: 'agent' | 'human'; name: string; role: string | null
    initial: string; avatarBg: string; avatarUrl: string | null
    status: string; statusUpdatedAt: string | null
    bio: string | null; tools: string[] | null; capabilities: string[] | null
    systemPrompt: string | null
    email: string | null; companySlug: string | null
    departedAt: string | null; managed: boolean; projectId: string | null; presetKey: string | null
  }>(
    `SELECT p.id, p.kind, p.name, p.role, p.initial,
            p.avatar_bg AS "avatarBg", p.avatar_url AS "avatarUrl",
            p.status, p.status_updated_at AS "statusUpdatedAt",
            p.bio, p.tools, p.capabilities, p.system_prompt AS "systemPrompt",
            -- Email resolution differs by kind:
            --  - agents carry their own minted address on participants.email
            --  - humans don't have one there; surface their real auth email
            --    (users.email) ONLY for humans who are actually members of
            --    THIS company. The cm JOIN is the safety check — without it,
            --    a participant with kind='human' and an id that happens to
            --    match a user.id elsewhere would leak that user's email,
            --    which is wrong even if rare. Demo-seed humans (wei / maya
            --    with no user row) just get null email — fine, they're not
            --    real and can't receive mail anyway.
            COALESCE(
              p.email,
              CASE WHEN p.kind = 'human' AND cm.user_id IS NOT NULL THEN u.email END
            ) AS email,
            comp.slug AS "companySlug",
            p.departed_at AS "departedAt",p.preset_key AS "presetKey",
            EXISTS(
              SELECT 1 FROM learning_project_teacher_agents managed_pulse
               WHERE managed_pulse.agent_id=p.id AND managed_pulse.company_id=p.company_id
            ) AS managed,
            (SELECT managed_pulse.project_id FROM learning_project_teacher_agents managed_pulse
              WHERE managed_pulse.agent_id=p.id AND managed_pulse.company_id=p.company_id LIMIT 1) AS "projectId"
       FROM participants p
       JOIN companies comp ON comp.id = p.company_id
       LEFT JOIN company_members cm
              ON cm.user_id = p.id AND cm.company_id = p.company_id
       LEFT JOIN users u ON u.id = cm.user_id
      WHERE p.company_id = $1
        AND (
          NOT EXISTS (
            SELECT 1 FROM learning_project_teacher_agents pulse
             WHERE pulse.agent_id=p.id AND pulse.company_id=p.company_id
          )
          OR EXISTS (
            SELECT 1
              FROM learning_project_teacher_agents pulse
              JOIN courses pulse_course
                ON pulse_course.project_id=pulse.project_id AND pulse_course.company_id=pulse.company_id
              JOIN course_members pulse_teacher
                ON pulse_teacher.course_id=pulse_course.id AND pulse_teacher.company_id=pulse_course.company_id
               AND pulse_teacher.user_id=$3 AND pulse_teacher.role='teacher'
             WHERE pulse.agent_id=p.id AND pulse.company_id=p.company_id AND pulse.project_id=$2
          )
        )
        AND (
          p.kind = 'agent'
          OR EXISTS (
            SELECT 1
              FROM projects selected_project
              LEFT JOIN courses selected_course ON selected_course.project_id = selected_project.id
              LEFT JOIN course_members selected_member
                ON selected_member.course_id = selected_course.id AND selected_member.user_id = p.id
             WHERE selected_project.id = $2
               AND selected_project.company_id = p.company_id
               AND (selected_project.is_general = TRUE OR selected_member.user_id IS NOT NULL)
          )
        )
      ORDER BY p.kind DESC, p.name ASC`,
    [tenant, projectId, me],
  )
  // Compute deterministic addresses for agents who haven't been
  // lazy-minted yet — without this, the renderer's recipient picker hides
  // every fresh agent (their email column is NULL until first send/recv),
  // which is exactly wrong for "compose new email to an agent". The mint
  // itself stays lazy on the write path; this is just surfacing the
  // address that WILL be used.
  const { computeAgentAddress } = await import('../../email.js')
  const finalRows = rows.map((r) => {
    if (r.managed || r.email || r.kind !== 'agent' || !r.companySlug) {
      const { companySlug: _drop, ...rest } = r
      return r.managed ? { ...rest, email: null } : rest
    }
    const computed = computeAgentAddress(r.id, r.companySlug)
    const { companySlug: _drop, ...rest } = r
    return { ...rest, email: computed }
  })
  res.json(finalRows)
})

/* ============== Agent CRUD ============== */

const AVATAR_PALETTE = [
  '#FFB088', '#FFD9D2', '#FFB7AF', '#F4B740',
  '#7C5CFF', '#A593FF', '#4FC2F4', '#41B5DC',
  '#4FC2A1', '#6EC56A', '#E9A0E9', '#FF7AB6',
]
function defaultAvatarBg(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]
}

/* ============== Deterministic visual signature per agent ============== */

// FNV-1a hash — stable across runs, no deps.
function hashStr(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h = ((h ^ s.charCodeAt(i)) >>> 0)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

// Dimensions restored to the FIRST-VERSION register the user liked:
// "real human with their own bones, skin, and history" — character-driven,
// lived-in, with a wide range of media and moods. NOT a fashion-editorial
// or single-national-style framing.
//
// What's kept from the iterations since:
//   1. Gender stratification on `presentation` — the LLM classifier picks
//      the bucket (otherwise outputs drift mono-gender).
//   2. Anti-oily guardrails in the main prompt body (matte natural skin,
//      no glass-skin, no highlighter) — applied as a wrapper, not by
//      stripping the dimension pools.
const VISUAL_DIMENSIONS = {
  // Young — 21–32 sweet spot for "striking young person with personality".
  // Avoid 35+ because the user explicitly said the previous round felt 老气
  // (old-feeling). Also drop the youngest 19-20 — they read as students,
  // not as confident creative adults.
  age: ['21', '22', '22', '23', '23', '24', '24', '25', '25', '26', '26', '27', '28', '29', '31', '32'],
  // Gender-stratified. For FEMININE: emphasize clearly feminine, pretty,
  // youthful — softly girlish features. Earlier pools mixed in cues like
  // "fox-eyed" / "sharp refined" that, combined with short hair and
  // menswear, were drifting the output away from the intended pretty-girl
  // register. The new pool keeps everything unambiguously feminine.
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
  // Skin pool — skewed toward light and light-medium. Duplicated entries are
  // intentional, used as weights against the deterministic hash. Deep-brown /
  // umber / sepia were removed to match the project's preferred register.
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
  // Removed salt-and-pepper / silver-gray — those aged everyone. Kept the
  // statement colors (bleached streak, copper red, dyed tints) for personality.
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
  // Feminine hair — LONGER / SOFTER / PRETTIER. Pixie cuts / undercuts /
  // close-cropped coils were moved to the masculine and androgynous pools
  // because, combined with other elements here, they drifted the output
  // away from the intended pretty-girl register. Kept diversity (curls,
  // braids, ponytail) but every entry here is unambiguously feminine.
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
  // No "shaved head with stubble line" or "grown-out side-part" — those read
  // older. Lean into on-trend young creative-class cuts.
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
  // Androgynous hair — softened. Buzz cuts / razor temples / undercuts were
  // pulling outputs toward a butch register; replaced with medium-length and
  // soft styles that still read gender-neutral.
  hairStyleAndrogynous: [
    'shoulder-length and tucked loosely behind the ears',
    'a soft chin-length bob with a center part',
    'medium-length tousled hair with a gentle curtain fringe',
    'shoulder-length wavy hair, free and loose',
    'a soft mid-length cut brushed casually back',
    'collarbone-length straight hair with a blunt soft fringe',
  ],
  // SINGLE memorable feature — photogenic and charming. Removed septum
  // ring, stick-and-poke tattoo, white-eyeliner makeup accent, multi-pierced
  // ear stack, "fox-eyed outer lift" — combined with other entries those
  // were drifting toward an art-school / alt-fashion register that didn't
  // match the intended young-pretty-person aesthetic.
  signature: [
    'a small beauty mark just under the left eye',
    'a constellation of light freckles across the nose and cheekbones',
    'a single dimple on the left cheek that shows when smiling',
    'long curling eyelashes that catch light',
    'a soft cupid\'s-bow on the upper lip',
    'an asymmetric raised eyebrow at rest, full of personality',
    'a small mole at the corner of the mouth',
    'a faint natural blush at the apples of the cheeks',
    'plush soft lips with a gentle natural shape',
    'a small delicate gold stud earring',
    'a soft pink flush across the cheeks and nose bridge',
    'a sweet softly rounded chin',
  ],
  glasses: ['no glasses', 'thin gold wire-frames worn low on the bridge', 'small round John-Lennon-style wire-frames', 'narrow rectangular tortoiseshell frames', 'no glasses', 'oversized rounded clear-acetate frames', 'no glasses', 'thin matte-black wire-frames', 'reading glasses pushed up into the hair', 'no glasses'],
  // Lived-in, character-driven accessories from the first version.
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
  // FEMININE wardrobe — clearly feminine, pretty, youthful. Earlier
  // entries (leather jacket / structured blazer over camisole / chambray
  // shirt-dress / Breton stripe / silk slip) were drifting the output
  // away from the intended pretty-girl register. Lean into pastel knits,
  // puff sleeves, soft blouses with feminine details (bows, ribbons,
  // lace trim), pretty dresses, distinctly girlish pieces.
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
  // Androgynous wardrobe — softened. Cropped leather jacket / black turtleneck
  // / structured blazer were combining with short hair to read butch; replaced
  // with softer knits, linens, and oversized shirts that still feel neutral.
  wardrobeAndrogynous: [
    'a soft oversized cream knit, minimalist and modern',
    'a soft camel cashmere cardigan over a fine ribbed tee',
    'a clean white oxford with the collar slightly relaxed',
    'a sage linen shirt with the top buttons casually open',
    'a soft beige sweatshirt with a relaxed neckline',
    'an oversized chambray shirt worn loose, effortlessly cool',
    'a fine fawn merino crewneck over a thin white tee',
  ],
  // 10 different illustrators / media — the strongest lever for visual
  // distinctness. This pool stays exactly as first-version.
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
  // Moody, saturated, tactile — first-version backgrounds. NOT pastel-heavy.
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
  // LIVELY + PLAYFUL — no more "introspective" / "guarded" / "patient
  // listening" (those read 老气 + stiff). Each vibe entry now has motion,
  // charm, or a flicker of personality. Mix of joyful, mischievous,
  // confident, and a few quieter ones for variety.
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
  // ACTIVE candid poses — feels caught mid-moment, NOT a stiff portrait
  // shot. Mix angles, tilts, glances. No "chin tucked low eyes up" (that
  // reads sultry / "model gaze"). All read playful / candid / alive.
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
} as const

function pickFromHash<T>(arr: readonly T[], h: number, salt: number): T {
  return arr[((h ^ salt) >>> 0) % arr.length]
}

type Gender = 'feminine' | 'masculine' | 'androgynous'

/**
 * Infer an agent's gender presentation from their name + role + style. Calls
 * a cheap LLM classifier so the choice respects the agent's actual identity
 * rather than defaulting everyone to one bucket. On classifier error falls
 * back to a deterministic feminine/masculine pick from the agent's name hash
 * — never defaults to androgynous, since the androgynous visual branch is
 * intentionally rare in this project.
 */
async function inferAgentGender(args: {
  name: string; role: string; systemPrompt: string
  /** Tenant for sub2api routing — falls back to legacy global key
   *  when null. */
  tenant: string | null
}): Promise<Gender> {
  const { name, role, systemPrompt } = args
  const hashFallback: Gender = (hashStr(name) & 1) === 0 ? 'feminine' : 'masculine'
  try {
    const { getTrackedLlmClient } = await import('../../agents/llm-ledger.js')
    const client = await getTrackedLlmClient({
      purpose: 'gender', companyId: args.tenant,
      extras: { agentName: name, role: role.slice(0, 60) },
    })
    const r = await client.chat.completions.create({
      model: env.DEEPSEEK_MODEL,
      // Lean STRONGLY COMMITTAL toward feminine/masculine. The androgynous
      // branch's pools (short hair + menswear) drift the output toward a
      // butch register the project doesn't want, so reserve androgynous for
      // the rare case where the name is an abstract brand codename with no
      // human gender lean at all (e.g. "Nimbus", "Helix"). For any name with
      // even a faint feminine OR masculine cultural lean, pick that.
      messages: [{ role: 'system', content: `Reply with strict JSON only: {"gender": "feminine" | "masculine"}, or "androgynous" only in the rare case below.

Strongly prefer feminine or masculine. Decide primarily by the NAME's cultural convention (e.g. "Atlas" / "Bram" → masculine; "Iris" / "Maya" → feminine). If the name is unisex (e.g. "Quinn", "Sky", "Riley"), use the persona / role text to break the tie. If it still leans either way at all, pick that side.

Only return "androgynous" when the name is an abstract / brand-style codename with no human gender association (e.g. "Nimbus", "Helix", "Vector") AND the persona text gives no human gender cue. This should be rare.

No prose, no explanation.` }, { role: 'user', content: `Classify the agent below and reply as JSON.

Name: ${name}
Role: ${role || '(none)'}
Persona / style:
${systemPrompt.slice(0, 500) || '(none)'}` }],
      response_format: { type: 'json_object' },
      max_tokens: 200,
    })
    const parsed = JSON.parse(r.choices[0]?.message?.content ?? '{}') as { gender?: string }
    if (parsed.gender === 'feminine' || parsed.gender === 'masculine' || parsed.gender === 'androgynous') {
      return parsed.gender
    }
  } catch (e) {
    console.warn('[avatar] gender inference failed, falling back to name-hash pick', e)
  }
  return hashFallback
}

function visualSignatureFor(agentId: string, gender: Gender): {
  age: string; presentation: string; skin: string
  hairColor: string; hairStyle: string
  signature: string
  glasses: string; accessory: string
  wardrobe: string; artStyle: string
  background: string; vibe: string; headAngle: string
  gender: Gender
} {
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

interface AgentBody {
  id?: unknown; name?: unknown; role?: unknown
  systemPrompt?: unknown; bio?: unknown
  initial?: unknown; avatarBg?: unknown; avatarUrl?: unknown
  tools?: unknown; capabilities?: unknown
}
const AGENT_CAPABILITIES = new Set(['canvas', 'web', 'files', 'email', 'documents', 'calendar', 'knowledge'])
const DEFAULT_AGENT_CAPABILITIES = ['canvas', 'web', 'files', 'email', 'documents']
function readAgentBody(b: AgentBody): {
  id?: string; name?: string; role?: string
  systemPrompt?: string; bio?: string
  initial?: string; avatarBg?: string
  /** undefined = leave alone, null = explicit clear, string = set */
  avatarUrl?: string | null
  tools?: string[] | null
  capabilities?: string[]
} {
  const out: Record<string, unknown> = {}
  if (typeof b.id === 'string')           out.id = b.id.trim()
  if (typeof b.name === 'string')         out.name = b.name.trim()
  if (typeof b.role === 'string')         out.role = b.role.trim()
  if (typeof b.systemPrompt === 'string') out.systemPrompt = b.systemPrompt
  if (typeof b.bio === 'string')          out.bio = b.bio
  if (typeof b.initial === 'string')      out.initial = b.initial.trim().slice(0, 2)
  if (typeof b.avatarBg === 'string')     out.avatarBg = b.avatarBg.trim()
  if (b.avatarUrl === null)               out.avatarUrl = null
  else if (typeof b.avatarUrl === 'string') out.avatarUrl = b.avatarUrl.trim()
  if (Array.isArray(b.tools))             out.tools = b.tools.map((x) => String(x))
  if (Array.isArray(b.capabilities)) {
    out.capabilities = [...new Set(b.capabilities.map(String).filter((x) => AGENT_CAPABILITIES.has(x)))]
  }
  return out as ReturnType<typeof readAgentBody>
}

/** Slugify a display name into a candidate agent id: lowercase ASCII
 *  letters/digits/hyphens, starts with a letter, capped at 24 chars.
 *  Falls back to `'agent'` when the name has no usable ASCII tail
 *  (e.g. an all-CJK / emoji name). Used by /agents POST to derive
 *  the agent id from the user-supplied name — users no longer enter
 *  an id directly, so we get to enforce shape AND global uniqueness
 *  invisibly. */
function slugifyAgentName(name: string): string {
  const lowered = name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  let slug = lowered
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 24)
  if (!/^[a-z]/.test(slug)) slug = `a-${slug}`.slice(0, 24)
  if (slug.length === 0) slug = 'agent'
  return slug
}

/** Pick a globally-unique agent id, preferring the slug of `name` and
 *  falling back to `${slug}-${random4}` if (and as many times as)
 *  needed. The participants table enforces global uniqueness on
 *  `id WHERE kind='agent'` via a partial unique index, so this loop
 *  + the INSERT race together can still 409 if a peer wins; the
 *  caller catches that and retries with a fresh suffix. */
async function pickUniqueAgentId(baseName: string): Promise<string> {
  const base = slugifyAgentName(baseName)
  const tryIds: string[] = [base]
  for (let i = 0; i < 8; i++) {
    tryIds.push(`${base}-${Math.random().toString(36).slice(2, 6)}`)
  }
  for (const candidate of tryIds) {
    const { rows } = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM participants WHERE id = $1) AS exists`,
      [candidate],
    )
    if (!rows[0].exists) return candidate
  }
  // Wildly unlikely with 8 random suffixes.
  throw new HttpError(500, 'could not pick a unique agent id — please retry')
}

api.post('/agents', async (req, res) => {
  // Agents are shared workspace identities — they speak on behalf of the
  // company, hold their own LLM budget, and can email out. Restricting
  // create to owners/admins matches every other "shared workspace
  // configuration" path (invites, project archive).
  const { userId: me, companyId: tenant } = await requireCompanyRole(req)
  const data = readAgentBody(req.body ?? {})
  if (!data.name || !data.name.trim()) { res.status(400).json({ error: 'name required' }); return }
  if (!data.systemPrompt || data.systemPrompt.trim().length < 10) {
    res.status(400).json({ error: 'systemPrompt required (at least 10 chars — describe the agent\'s style)' }); return
  }
  await assertCompanyAgentLimit(tenant)
  // The id is now SERVER-generated from the name (slugified) rather
  // than user-supplied — users can't accidentally cause cross-tenant
  // id collisions, and the same display name landing in two
  // workspaces still produces two distinct ids (the second one gets
  // a random suffix).
  const agentId = await pickUniqueAgentId(data.name)
  const initial = data.initial || data.name.charAt(0).toUpperCase()
  const avatarBg = data.avatarBg || defaultAvatarBg(agentId)
  try {
    await pool.query(
      `INSERT INTO participants (id, kind, name, role, initial, avatar_bg, status, bio, tools, capabilities, system_prompt, company_id)
       VALUES ($1, 'agent', $2, $3, $4, $5, 'avail', $6, $7::jsonb, $8::jsonb, $9, $10)`,
      [agentId, data.name, data.role ?? '', initial, avatarBg, data.bio ?? '',
       JSON.stringify(['ipython']), JSON.stringify(data.capabilities ?? DEFAULT_AGENT_CAPABILITIES),
       data.systemPrompt, tenant],
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/duplicate key|participants_agent_id_unique/.test(msg)) {
      // Race window between pickUniqueAgentId's SELECT and the INSERT
      // — another POST squatted on this id. Client can retry.
      res.status(409).json({ error: 'agent id collision — please retry' })
    } else {
      res.status(500).json({ error: msg })
    }
    return
  }
  // Re-bind data.id for the rest of the handler so subsequent workspace
  // seeding and the response payload see it.
  data.id = agentId
  const { invalidatePersonaCache } = await import('../../agents/personas.js')
  invalidatePersonaCache()

  // Seed IDENTITY.md + SOUL.md at the workspace root. These are the
  // agent's self-definition — the system prompt loads them every turn
  // (see personas.ts:buildSystemPrompt). Agents can rewrite them via
  // `edit_file` / `write_file` as they evolve. We seed them with a
  // template based on the persona fields so the first wake-up isn't
  // identity-less.
  try {
    const identityBody = `# ${data.name}\n\n` +
      `**Role:** ${data.role ?? 'agent'}\n\n` +
      (data.bio ? `**Bio:**\n${data.bio}\n\n` : '') +
      `_This file is your identity. Edit it as you grow — what you write here_\n` +
      `_loads into your system prompt on every wake._\n`
    const soulBody = `# Soul of ${data.name}\n\n` +
      `## Voice\n\n` +
      `${data.systemPrompt}\n\n` +
      `## Principles\n\n` +
      `- Speak like a real person, not like a tech blog.\n` +
      `- Match the user's language.\n` +
      `- Save things worth remembering — they outlive any single conversation.\n\n` +
      `_This file is your voice + values. Edit it freely to evolve who you are._\n`
    await pool.query(
      `INSERT INTO agent_workspace (agent_id, path, body, company_id, updated_at)
       VALUES ($1, 'IDENTITY.md', $2, $3, NOW()),
              ($1, 'SOUL.md',    $4, $3, NOW())
       ON CONFLICT (agent_id, path) DO NOTHING`,
      [data.id, identityBody, tenant, soulBody],
    )
  } catch (e) {
    console.warn('[agents] seed IDENTITY/SOUL failed', e)
  }

  // Auto-create a 1:1 direct conversation between the creator and the
  // new agent. Without this, the agent never appears in the user's
  // conversations list until they manually click "Chat" — and the Chat
  // button on the agent card stays disabled because no direct exists.
  // Same idempotent shape as `POST /conversations/direct`.
  try {
    await pool.query(
      `INSERT INTO conversations (id, kind, title, subtitle, members, pinned, tag, company_id)
       VALUES ($1, 'direct', $2, NULL, $3::jsonb, FALSE, NULL, $4)
       ON CONFLICT (id) DO NOTHING`,
      [`direct-${data.id}-${randomUUID().slice(0, 6)}`, data.name, JSON.stringify([me, data.id]), tenant],
    )
    // Counter row is required for sequence allocation on the first message.
    await pool.query(
      `INSERT INTO conversation_counters (conversation_id, next_sequence)
       SELECT id, 1 FROM conversations
       WHERE kind = 'direct' AND company_id = $2
         AND members @> to_jsonb(ARRAY[$1::text]) AND members @> to_jsonb(ARRAY[$3::text])
         AND jsonb_array_length(members) = 2
       ON CONFLICT (conversation_id) DO NOTHING`,
      [me, tenant, data.id],
    )
  } catch (e) {
    console.warn('[agents] auto-create direct convo failed', e)
  }

  // Fire-and-forget portrait generation. The agent appears immediately
  // with their initial-letter avatar; the real portrait shows up on the
  // next /participants poll once the image is ready. We deliberately
  // don't block the 201 response since image gen can take several seconds.
  const newAgentId = data.id
  void generateAndPersistAvatar({ agentId: newAgentId, tenant })
    .then(() => console.log(`[agents] auto-portrait ready for ${newAgentId}`))
    .catch((e) => console.warn(`[agents] auto-portrait failed for ${newAgentId}`, e))

  res.status(201).json({ id: data.id })
})

api.put('/agents/:id', async (req, res) => {
  // Editing an Agent identity or capabilities changes a shared resource
  // every member talks to. Gate to owner/admin — same bar as creation.
  const { companyId: tenant } = await requireCompanyRole(req)
  const id = req.params.id
  await assertNotManagedPulse(id, tenant)
  const { rows: existing } = await pool.query<{ kind: string }>(
    `SELECT kind FROM participants WHERE id = $1 AND company_id = $2`, [id, tenant],
  )
  if (!existing[0]) { res.status(404).json({ error: 'not found' }); return }
  if (existing[0].kind !== 'agent') { res.status(400).json({ error: 'cannot edit non-agent participant' }); return }

  const data = readAgentBody(req.body ?? {})
  const sets: string[] = []
  const params: unknown[] = []
  const push = (col: string, val: unknown) => {
    params.push(val); sets.push(`${col} = $${params.length}`)
  }
  if (data.name !== undefined)         push('name', data.name)
  if (data.role !== undefined)         push('role', data.role)
  if (data.systemPrompt !== undefined) push('system_prompt', data.systemPrompt)
  if (data.bio !== undefined)          push('bio', data.bio)
  if (data.initial !== undefined)      push('initial', data.initial)
  if (data.avatarBg !== undefined)     push('avatar_bg', data.avatarBg)
  if (data.avatarUrl !== undefined)    push('avatar_url', data.avatarUrl)   // null clears it
  if (data.tools !== undefined)        push('tools', JSON.stringify(['ipython']))
  if (data.capabilities !== undefined) push('capabilities', JSON.stringify(data.capabilities))
  if (sets.length === 0) { res.status(400).json({ error: 'nothing to update' }); return }
  params.push(id, tenant)
  await pool.query(
    `UPDATE participants SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND company_id = $${params.length}`,
    params,
  )
  const { invalidatePersonaCache } = await import('../../agents/personas.js')
  invalidatePersonaCache(id)
  res.json({ ok: true })
})

/**
 * Off-board an agent (soft delete). Their memory / log / workspace / tasks are
 * preserved, their messages stay in conversation history. They stop being woken
 * by the scheduler and disappear from other agents' rosters. Use POST
 * /agents/:id/rehire to bring them back.
 */
api.delete('/agents/:id', async (req, res) => {
  // Off-boarding an agent silences it for the whole workspace and removes
  // it from every conversation's wake roster — destructive, owner/admin only.
  const { companyId: tenant } = await requireCompanyRole(req)
  const id = req.params.id
  await assertNotManagedPulse(id, tenant)
  const { rows: existing } = await pool.query<{ kind: string; departed_at: string | null }>(
    `SELECT kind, departed_at FROM participants WHERE id = $1 AND company_id = $2`, [id, tenant],
  )
  if (!existing[0]) { res.status(404).json({ error: 'not found' }); return }
  if (existing[0].kind !== 'agent') { res.status(400).json({ error: 'cannot off-board non-agent participant' }); return }
  if (existing[0].departed_at) { res.status(409).json({ error: 'already off-boarded' }); return }
  const { rows: ledGroups } = await pool.query<{ id: string; title: string }>(
    `SELECT id, title FROM conversations WHERE company_id = $1 AND kind = 'group' AND leader_id = $2 LIMIT 5`,
    [tenant, id],
  )
  if (ledGroups.length > 0) {
    res.status(409).json({
      error: `change the leader before off-boarding ${id}`,
      conversations: ledGroups,
    })
    return
  }
  await pool.query(
    `UPDATE participants
        SET departed_at = NOW(),
            status = 'resting',
            status_updated_at = NOW()
      WHERE id = $1 AND company_id = $2`,
    [id, tenant],
  )
  const { invalidatePersonaCache } = await import('../../agents/personas.js')
  invalidatePersonaCache(id)
  res.json({ ok: true, departedAt: new Date().toISOString() })
})

/**
 * Generate an AI portrait for an agent and save it as their avatar.
 * Uses an optional image capability exposed by the configured DeepSeek
 * gateway. Official text-only DeepSeek deployments require uploaded avatars.
 * combines the agent's name + role + style with a deterministic visual
 * signature derived from their id, so every agent gets a *distinct* look
 * (different age, skin tone, hair, wardrobe, etc.) but the same person
 * keeps the same look across regenerations.
 */
/**
 * Generate a portrait for an agent and persist it as their avatar_url.
 * Used by both the explicit /agents/:id/avatar/generate endpoint AND the
 * fire-and-forget auto-trigger after POST /agents. Throws on any failure
 * — caller decides whether to surface as 502 or just log.
 */
export async function generateAndPersistAvatar(args: {
  agentId: string
  tenant: string
}): Promise<{ url: string }> {
  const { agentId: id, tenant } = args
  const { rows } = await pool.query<{
    name: string; role: string | null; system_prompt: string | null; kind: string
  }>(
    `SELECT name, role, system_prompt, kind FROM participants WHERE id = $1 AND company_id = $2`,
    [id, tenant],
  )
  const a = rows[0]
  if (!a) throw new HttpError(404, 'not found')
  if (a.kind !== 'agent') throw new HttpError(400, 'avatar generation is only for agents')
  if (!env.DEEPSEEK_IMAGE_MODEL) {
    throw new HttpError(501, 'image generation is disabled; upload an avatar or configure a DeepSeek gateway image model')
  }

  const styleHint = (a.system_prompt ?? '').slice(0, 500)
  // Gender inference is async — call before the visual signature so we pick
  // from the right bucket. Falls back to androgynous if the classifier fails.
  const gender = await inferAgentGender({
    name: a.name, role: a.role ?? '', systemPrompt: styleHint, tenant,
  })
  const visual = visualSignatureFor(id, gender)
  const genderClause = gender === 'feminine'
    ? `${a.name} is a young woman with softly feminine features and styling — a pretty face, gentle expression, distinctly girlish attire (a dress, soft blouse, pastel knit, or similarly feminine piece). Long or shoulder-length soft hair.`
    : gender === 'masculine'
      ? `${a.name} is a young man with clearly masculine features and presentation.`
      : `${a.name}'s gender presentation is intentionally androgynous and refined.`
  const prompt = [
    // Leading framing: SPECIFIC + YOUNG + STRIKING + ALIVE. Image models
    // latch onto the leading adjectives, so we set "young / characterful /
    // beautiful / lively" up front, then add anti-oily as wrapper rules.
    `Draw ${a.name} — a young, striking, characterful individual. Beautiful in a distinctive, interesting way (not a generic "model type", not a "professional headshot"). The kind of person you'd notice in a coffee shop because their face has personality. Caught in a candid, playful moment — alive and engaged with the world, not posing stiffly. ${genderClause}`,
    '',
    `Who ${a.name} is, physically and personality-wise. EVERY detail below is required and must be visible in the portrait:`,
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
    a.role ? `• Their role: ${a.role}` : '',
    styleHint ? `• Inner essence the face should hint at: ${styleHint.slice(0, 240)}` : '',
    '',
    `RENDER STYLE — important, this is what gives the portrait its distinct artistic identity (do NOT default to a "minimalist editorial" baseline):`,
    `${visual.artStyle}.`,
    `Background: ${visual.background}.`,
    '',
    // Wrapper rules — applied as constraints on top of the first-version
    // framing. These two were learned from the rounds in between:
    `Skin finish — NATURAL, not oily:`,
    `- Skin should look like real human skin in honest light. Not shiny, not wet, not "glass-skin", not airbrushed. A real complexion with subtle texture.`,
    `- No makeup highlighter, no glossy lip highlights, no contouring. Brows and lashes natural, eyes alive on their own.`,
    `- Hair has a normal soft texture — no gel, no wet-look, no shellac.`,
    `- Tactile texture of the medium (paper grain, brushwork) belongs in the BACKGROUND and clothing, not as bright highlights on the face.`,
    '',
    'Hard rules:',
    '- Single subject, head-and-shoulders, square frame, head centered so a circular crop works.',
    `- This is ${a.name}, not a stand-in. Lean hard into the specific features above; do not soften them toward an average.`,
    `- The portrait MUST read as YOUNG (early 20s to early 30s) — never 35+, never "weathered", never "lived-in". If the face looks middle-aged, you have failed.`,
    `- The pose must feel ALIVE and CANDID — caught mid-moment, with motion or personality. Never stiff, never "official headshot", never "model gaze".`,
    `- Beautiful but DISTINCTIVE — striking features, real personality. Avoid generic "average attractive face".`,
    `- Respect the gender presentation above; do not contradict it.`,
    '- No text. No logos. No background figures. No stock-photo realism. No anime / chibi / exaggerated cartoon. No sultry / smoldering / "Tom Ford" glamour.',
    '- The portrait should feel like it was drawn for a profile in a magazine that cares deeply about who this person is — Refinery29 / Vice / Kinfolk / Cereal magazine youth-feature energy.',
  ].filter(Boolean).join('\n')

  const { getTrackedLlmClient } = await import('../../agents/llm-ledger.js')
  const client = await getTrackedLlmClient({
    purpose: 'avatar-image', companyId: tenant, agentId: id,
    extras: { gender, kind: a.kind },
  })
  const r = await client.images.generate({
    model: env.DEEPSEEK_IMAGE_MODEL,
    prompt,
    size: '1024x1024',
    n: 1,
  })
  const first = r.data?.[0]
  const b64 = first?.b64_json
  const remoteUrl = first?.url
  let imageBuf: Buffer
  if (b64) {
    imageBuf = Buffer.from(b64, 'base64')
  } else if (remoteUrl) {
    const fetched = await fetch(remoteUrl)
    imageBuf = Buffer.from(await fetched.arrayBuffer())
  } else {
    throw new HttpError(502, 'image API returned no image')
  }

  const key = `avatars/avatar-${id}-${randomUUID().slice(0, 8)}.png`
  const url = await storage.put(key, imageBuf, 'image/png')
  await pool.query(
    `UPDATE participants SET avatar_url = $2 WHERE id = $1 AND company_id = $3`,
    [id, url, tenant],
  )
  const { invalidatePersonaCache } = await import('../../agents/personas.js')
  invalidatePersonaCache(id)
  // Notify connected clients that this agent's avatar changed so they
  // can pick it up without waiting for the 60s periodic refresh.
  const { CH_STATUS, publish } = await import('../../redis.js')
  await publish(CH_STATUS, {
    type: 'participants.avatar',
    participantId: id,
    avatarUrl: url,
    companyId: tenant,
  })
  return { url }
}

api.post('/agents/:id/avatar/generate', async (req, res) => {
  // Hits the image API — burns real money. Owner/admin only, otherwise any
  // member could re-roll every agent's portrait in a loop and run up the
  // bill / consume the per-tenant image quota.
  const { companyId: tenant } = await requireCompanyRole(req)
  await assertNotManagedPulse(req.params.id, tenant)
  try {
    const { url } = await generateAndPersistAvatar({ agentId: req.params.id, tenant })
    res.json({ url })
  } catch (e) {
    if (e instanceof HttpError) { res.status(e.status).json({ error: e.message }); return }
    const msg = e instanceof Error ? e.message : String(e)
    res.status(502).json({ error: `image generation failed: ${msg}` })
  }
})

/** Re-hire an off-boarded agent — their memory and log come right back. */
api.post('/agents/:id/rehire', async (req, res) => {
  // Same gate as off-boarding (DELETE /agents/:id) — owner/admin only.
  const { companyId: tenant } = await requireCompanyRole(req)
  const id = req.params.id
  await assertNotManagedPulse(id, tenant)
  const { rows: existing } = await pool.query<{ kind: string; departed_at: string | null }>(
    `SELECT kind, departed_at FROM participants WHERE id = $1 AND company_id = $2`, [id, tenant],
  )
  if (!existing[0]) { res.status(404).json({ error: 'not found' }); return }
  if (existing[0].kind !== 'agent') { res.status(400).json({ error: 'cannot rehire non-agent participant' }); return }
  if (!existing[0].departed_at) { res.status(409).json({ error: 'agent is not off-boarded' }); return }
  await assertCompanyAgentLimit(tenant)
  await pool.query(
    `UPDATE participants
        SET departed_at = NULL,
            status = 'avail',
            status_updated_at = NOW()
      WHERE id = $1 AND company_id = $2`,
    [id, tenant],
  )
  const { invalidatePersonaCache } = await import('../../agents/personas.js')
  invalidatePersonaCache(id)
  res.json({ ok: true })
})

/* ============== Preferences + autonomy ============== */

api.get('/me/preferences', async (req, res) => {
  const me = requireAuth(req)
  const { rows } = await pool.query<{ prefs: Record<string, unknown> }>(
    `SELECT prefs FROM user_preferences WHERE user_id = $1`,
    [me],
  )
  res.json(rows[0]?.prefs ?? {})
})

api.put('/me/preferences', async (req, res) => {
  const me = requireAuth(req)
  const prefs = req.body ?? {}
  await pool.query(
    `INSERT INTO user_preferences (user_id, prefs, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (user_id) DO UPDATE
        SET prefs = EXCLUDED.prefs, updated_at = NOW()`,
    [me, JSON.stringify(prefs)],
  )
  res.json({ ok: true })
})

api.get('/agents/:id/autonomy', async (req, res) => {
  const { userId: me, companyId: tenant } = await requireCompany(req)
  await assertPulseVisible(req.params.id, tenant, me)
  const { rows: gate } = await pool.query(
    `SELECT 1 FROM participants WHERE id = $1 AND company_id = $2 LIMIT 1`,
    [req.params.id, tenant],
  )
  if (!gate[0]) { res.status(404).json({ error: 'not found' }); return }
  const { rows } = await pool.query(
    `SELECT user_id AS "userId", agent_id AS "agentId", threshold, pulled, led, dissolved
       FROM agent_autonomy WHERE user_id = $1 AND agent_id = $2`,
    [me, req.params.id],
  )
  res.json(rows[0] ?? { userId: me, agentId: req.params.id, threshold: 0.6, pulled: 0, led: 0, dissolved: 0 })
})

api.put('/agents/:id/autonomy', async (req, res) => {
  const { userId: me, companyId: tenant } = await requireCompany(req)
  await assertNotManagedPulse(req.params.id, tenant)
  const { rows: gate } = await pool.query(
    `SELECT 1 FROM participants WHERE id = $1 AND company_id = $2 LIMIT 1`,
    [req.params.id, tenant],
  )
  if (!gate[0]) { res.status(404).json({ error: 'not found' }); return }
  const threshold = Math.max(0, Math.min(1, Number(req.body?.threshold ?? 0.6)))
  await pool.query(
    `INSERT INTO agent_autonomy (user_id, agent_id, threshold)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, agent_id) DO UPDATE SET threshold = EXCLUDED.threshold`,
    [me, req.params.id, threshold],
  )
  res.json({ ok: true, threshold })
})

api.get('/agents/autonomy', async (req, res) => {
  const { userId: me, companyId: tenant } = await requireCompany(req)
  const { rows } = await pool.query(
    `SELECT a.user_id AS "userId", a.agent_id AS "agentId",
            a.threshold, a.pulled, a.led, a.dissolved
      FROM agent_autonomy a
       JOIN participants p ON p.id = a.agent_id
      WHERE a.user_id = $1 AND p.company_id = $2
        AND (
          NOT EXISTS (SELECT 1 FROM learning_project_teacher_agents pulse WHERE pulse.agent_id=p.id AND pulse.company_id=p.company_id)
          OR EXISTS (
            SELECT 1 FROM learning_project_teacher_agents pulse
              JOIN courses course ON course.project_id=pulse.project_id AND course.company_id=pulse.company_id
              JOIN course_members teacher ON teacher.course_id=course.id AND teacher.company_id=course.company_id
               AND teacher.user_id=$1 AND teacher.role='teacher'
             WHERE pulse.agent_id=p.id AND pulse.company_id=p.company_id
          )
        )`,
    [me, tenant],
  )
  res.json(rows)
})
