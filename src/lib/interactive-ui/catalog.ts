import { createLibrary, defineComponent, markReactive, type ComponentRenderProps } from '@openuidev/lang-core'
import { z } from 'zod'

export const OPENUI_CATALOG_VERSION = 'learning-1'
export const OPENUI_RENDERER_VERSION = 'openui-0.3.2'
export const OPENUI_LANGUAGE = 'lingxiloop-openui-v1'
export const OPENUI_COMPONENT = 'openui-lesson'
// Re-enable only after the complete live-model and browser acceptance gate passes.
export const INTERACTIVE_LESSONS_ENABLED = false
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
  Choice: 'A labelled choice from the listed strings. value MUST bind a declared $variable whose literal default exactly matches one of the options strings, never an empty placeholder.', Toggle: 'A labelled true/false control; value MUST bind a declared $variable.',
  Prediction: 'Ask for a prediction or answer before observing. value MUST bind a declared string $variable. Never include a score.',
  Steps: 'Step-by-step explanation with a bound zero-based integer step variable. Its default must be between 0 and steps.length-1.',
  Table: 'Compare concepts in a bounded table.', LearningAction: 'An explicit authorized learning event: explain, check-prediction, or submit-answer. No tools, URLs, grades or implicit execution.',
  ProjectilePlot: 'No-drag projectile motion in SI units; angle in degrees, speed m/s, gravity m/s², height m. Shows trajectory and computed range/time/height.',
  FunctionPlot: 'Compare up to four real polynomials a*x²+b*x+c with analytic intersections. Each curve needs a unique id. domain is [min,max] with min strictly less than max. a=0 makes a linear function.',
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
  // Upstream bindings also advertise forbidden expressions and implicit null defaults.
  return lessonLibrary.prompt({ bindings: false, toolCalls: false,
    preamble: `This chat has an installed interactive lesson renderer. A root-level fenced block with EXACT language ${OPENUI_LANGUAGE} in your native final answer is rendered as a working interactive lesson automatically; no tool, file, separate page or publishing step is needed. When the user asks for an interactive explanation supported by the registered components below, provide that fenced lesson together with your explanation. Otherwise choose interaction only when useful; prefer plain text for concise/text-only requests and when no registered capability helps. Do not use generic openui-lang fences.`,
    additionalRules: [
      'Only compose registered components, literal values, named references and $state references. No Query, Mutation, builtins, arithmetic, member access, assignments inside expressions, HTML, JS, links or external resources. Scientific calculations occur in registered kernels.',
      'Define each identifier exactly once. Put root first, then all literal $state defaults, then the referenced components. Make every component reachable from root. Declare a literal default for every $variable, including $prediction = "" for Prediction and $step = 0 for Steps. Each $variable must have exactly one matching control: for every Parameter, Choice, Toggle, Prediction or Steps, name must equal the variable name without $, and value must be that $variable, never a literal.',
      'Control name and LearningAction actionId must be ASCII identifiers: start with a letter, then letters, digits or underscores, at most 48 characters. No hyphens, spaces or Chinese characters in these identifiers; labels and teaching text can be Chinese.',
      'Keep explanations and controls consistent with kernel units and assumptions. Begin with a prediction, enable observation, offer an explicit explanation/check action, and include a transfer question. Do not force every learning task into a fixed layout.',
      'Write only student-facing explanation outside the fence, never planning, verification notes or DSL source. Put each opening and closing fence on its own line, separated from prose by a blank line. Lesson fallback must explain the concept without the visualization. The DSL must be fully closed. At most four small lessons per message.',
      'Deliver the complete fenced lesson in the native final answer, never through chat.send. Check the source silently; do not print the verification checklist or repeat the candidate.',
      'The component catalog and any current lesson revisions are already in context. A native interactive lesson is response delivery, not a business action: task.inspect and task.check_receipt do not validate its source, rendering or delivery, and completedBusinessAction:false does not prevent this final answer. Generate the lesson directly; do not use chat.history to check source or chat.send to announce it. Use tools only when the actual learning task needs external data or a business operation. Include only the controls that help the requested explanation.',
      'For a requested revision preserve stable variable names/meanings, update all text and graphs together, and use only revisionOf/baseRevision provided by the host. For a new lesson omit both revision fields. Never invent IDs.',
    ], examples: [`\`\`\`${OPENUI_LANGUAGE}\nroot = Lesson("抛射角与射程", "无空气阻力且起落等高时，45°的射程最大。", [prediction,angle,plot,explain])\n$angle = 45\n$prediction = ""\nprediction = Prediction("prediction", "先预测：30°与60°谁更远？", $prediction)\nangle = Parameter("angle", "角度", $angle, 0, 90, 1, "°", "projectile.angle")\nplot = ProjectilePlot($angle, 20, 9.81, 0)\nexplain = LearningAction("explain", "explain", "解释当前结果")\n\`\`\``,
      `\`\`\`${OPENUI_LANGUAGE}\nroot = Lesson("先预测，再观察", "平移改变截距，不改变斜率。", [prediction,steps,check])\n$step = 0\n$prediction = ""\nprediction = Prediction("prediction", "图线向上移动后斜率会变吗？", $prediction)\nsteps = Steps("step", "观察变化", $step, [{title:"原图",text:"y=2x，斜率为2。"},{title:"向上平移",text:"y=2x+3，斜率仍为2。"}])\ncheck = LearningAction("check", "check-prediction", "检查预测")\n\`\`\``] })
}
