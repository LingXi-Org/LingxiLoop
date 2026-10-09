import { createLibrary, defineComponent, markReactive, type ComponentRenderProps } from '@openuidev/lang-core'
import { z } from 'zod'

export const OPENUI_CATALOG_VERSION = 'learning-1'
export const OPENUI_RENDERER_VERSION = 'openui-0.3.2'
export const OPENUI_LANGUAGE = 'lingxiloop-openui-v1'
export const OPENUI_COMPONENT = 'openui-lesson'
export const UI_LIMITS = { sourceBytes: 32_768, depth: 16, nodes: 512, statements: 128, fields: 32, stateBytes: 8_192, actions: 16 } as const

const text = z.string().max(4_000)
const label = z.string().min(1).max(160)
const name = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,47}$/)
const finite = z.number().finite()
const bounded = finite.min(-1_000_000).max(1_000_000)
const children = z.array(z.unknown()).max(64)
const reactiveNumber = bounded.clone()
const reactiveText = z.string().max(2_000)
const reactiveBoolean = z.boolean()
markReactive(reactiveNumber)
markReactive(reactiveText)
markReactive(reactiveBoolean)

// Positional property order is part of the persisted learning-1 language contract.
export const lessonComponentSchemas = {
  Lesson: z.object({ title: label, fallback: text.min(1), children, revisionOf: z.string().max(200).optional(), baseRevision: z.number().int().positive().optional() }).strict(),
  Layout: z.object({ children, columns: z.union([z.literal(1), z.literal(2)]).optional() }).strict(),
  Text: z.object({ text }).strict(),
  Parameter: z.object({ name, label, value: reactiveNumber, min: bounded, max: bounded, step: finite.positive().max(1_000_000), unit: z.string().max(32), semantic: z.string().min(1).max(100) }).strict(),
  Choice: z.object({ name, label, value: reactiveText, options: z.array(label).min(1).max(16), semantic: z.string().max(100).optional() }).strict(),
  Toggle: z.object({ name, label, value: reactiveBoolean, semantic: z.string().max(100).optional() }).strict(),
  Prediction: z.object({ name, label, value: reactiveText }).strict(),
  Steps: z.object({ name, title: label, value: reactiveNumber, steps: z.array(z.object({ title: label, text }).strict()).min(1).max(12) }).strict(),
  Table: z.object({ headers: z.array(label).min(1).max(6), rows: z.array(z.array(z.string().max(1_000)).max(6)).max(30) }).strict(),
  LearningAction: z.object({ actionId: name, kind: z.enum(['explain', 'check-prediction', 'submit-answer']), label }).strict(),
  ProjectilePlot: z.object({ angle: finite.min(0).max(90), speed: finite.min(0).max(100), gravity: finite.min(0.01).max(100), height: finite.min(0).max(1_000) }).strict(),
  FunctionPlot: z.object({ curves: z.array(z.object({ id: label, a: bounded, b: bounded, c: bounded }).strict()).min(1).max(4), domain: z.tuple([bounded, bounded]) }).strict(),
  DctImage: z.object({ keep: z.number().int().min(0).max(256), size: z.union([z.literal(8), z.literal(16)]) }).strict(),
  CltPlot: z.object({ distribution: z.enum(['uniform', 'bernoulli', 'exponential']), sampleSize: z.number().int().min(1).max(100), trials: z.number().int().min(1).max(10_000), seed: z.number().int().min(0).max(0xffffffff) }).strict(),
  MontyHall: z.object({ selectedDoor: z.number().int().min(0).max(2), reveal: z.boolean(), switchDoor: z.boolean(), trials: z.number().int().min(1).max(100_000), seed: z.number().int().min(0).max(0xffffffff) }).strict(),
} as const
export type LessonComponentName = keyof typeof lessonComponentSchemas
export type LessonComponentProps<N extends LessonComponentName> = z.infer<(typeof lessonComponentSchemas)[N]>

const descriptions: Record<LessonComponentName, string> = {
  Lesson: 'Root of one learning explanation. fallback is a complete plain-text alternative. For a revision only, copy revisionOf/baseRevision from authorized context.',
  Layout: 'Compose children in one or two responsive columns.', Text: 'A short explanation in safe Markdown; scientific results belong to kernels, not generated arithmetic.',
  Parameter: 'Continuous number slider. value MUST bind a declared $variable. name is that variable without $. Include its unit and stable scientific meaning.',
  Choice: 'A labelled choice from the listed strings. value MUST bind a declared $variable.', Toggle: 'A labelled true/false control; value MUST bind a declared $variable.',
  Prediction: 'Ask for a prediction or answer before observing. value MUST bind a declared string $variable. Never include a score.',
  Steps: 'Step-by-step explanation with a bound zero-based numeric step variable.',
  Table: 'Compare concepts in a bounded table.', LearningAction: 'An explicit authorized learning event: explain, check-prediction, or submit-answer. No tools, URLs, grades or implicit execution.',
  ProjectilePlot: 'No-drag projectile motion in SI units; angle in degrees, speed m/s, gravity m/s², height m. Shows trajectory and computed range/time/height.',
  FunctionPlot: 'Compare up to four real polynomials a*x²+b*x+c with analytic intersections in the domain. a=0 makes a linear function.',
  DctImage: 'A fixed reproducible grayscale image, orthonormal 2D DCT with zigzag coefficient retention, reconstruction and error; keep <= size².',
  CltPlot: 'Seeded sampling of means from U(0,1), Bernoulli(0.5), or Exp(1). At most 1,000,000 sample operations.',
  MontyHall: 'Three-door Monty Hall experiment. Doors are indexed 0..2; host knows prize, always opens an unselected losing door. Switch wins with probability 2/3.',
}

export function createLessonLibrary<C>(renderers: Record<LessonComponentName, C>) {
  return createLibrary<C>({ root: 'Lesson', components: Object.entries(lessonComponentSchemas).map(([componentName, props]) =>
    defineComponent({ name: componentName, props, description: descriptions[componentName as LessonComponentName], component: renderers[componentName as LessonComponentName] })) })
}
export type LessonRenderProps = ComponentRenderProps<Record<string, unknown>, unknown>
export const lessonLibrary = createLessonLibrary(Object.fromEntries(Object.keys(lessonComponentSchemas).map(key => [key, null])) as Record<LessonComponentName, null>)

export function lessonInstructions(): string {
  return lessonLibrary.prompt({ bindings: true, toolCalls: false, inlineMode: true,
    preamble: `Interactive learning is optional. Prefer plain text for concise/text-only requests and when no registered capability helps. If useful, compose text and a root-level fenced block with EXACT language ${OPENUI_LANGUAGE}. Do not use generic openui-lang fences.`,
    additionalRules: [
      'Only compose registered components, literal values, named references and $state references. No Query, Mutation, builtins, arithmetic, member access, assignments inside expressions, HTML, JS, links or external resources. Scientific calculations occur in registered kernels.',
      'Define each identifier exactly once, put root first or after literal $defaults, and make every component reachable from root. Each $variable must have exactly one matching named control. Controls use $variable as value, never a literal.',
      'Keep explanations and controls consistent with kernel units and assumptions. Begin with a prediction, enable observation, offer an explicit explanation/check action, and include a transfer question. Do not force every learning task into a fixed layout.',
      'Write readable explanation outside the fence. Lesson fallback must explain the concept without the visualization. The DSL must be fully closed. At most four small lessons per message.',
      'For a requested revision preserve stable variable names/meanings, update all text and graphs together, and use only revisionOf/baseRevision provided by the host. For a new lesson omit both revision fields. Never invent IDs.',
    ], examples: [`$angle = 45\nroot = Lesson("抛射角与射程", "无空气阻力且起落等高时，45°的射程最大。", [angle,plot,explain])\nangle = Parameter("angle", "角度", $angle, 0, 90, 1, "°", "projectile.angle")\nplot = ProjectilePlot($angle, 20, 9.81, 0)\nexplain = LearningAction("explain", "explain", "解释当前结果")`] })
}
