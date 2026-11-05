// Daily product boundaries; heavy scenarios remain selected or explicit full runs.
export const SMOKE_FILES = Object.freeze([
  'identity-vertical-slice.test.ts',
  'permission-resolver.test.ts',
  'native-message-flow.test.ts',
  'runtime-realtime.test.ts',
  'public-activity-history.test.ts',
  'public-run-activity.test.ts',
  'basic-process-recovery.test.ts',
])

// Actual 20-root/variant waits and a real abandoned lease do not fit in the
// ordinary smoke allowance. Only these named owning cases add bounded time.
export const DURABLE_QUEUE_ALLOWANCE_MS = Object.freeze({
  'runtime-queue-interactive-capacity.test.ts': 90_000,
  'runtime-queue-background-capacity.test.ts': 150_000,
  'runtime-queue-capacity.test.ts': 120_000,
  'runtime-queue-lifecycle.test.ts': 90_000,
})
export function integrationOwnerAllowanceMs(mode, files) {
  return mode === 'selected' ? [...new Set(files)].reduce((total,file) =>
    total + (Object.hasOwn(DURABLE_QUEUE_ALLOWANCE_MS,file) ? DURABLE_QUEUE_ALLOWANCE_MS[file] : 0),0) : 0
}

// Selected runs can contain most of the suite after a shared runtime change.
// Preserve the short-run floor, allow one minute per owning file, and never
// exceed the ordinary full-suite ceiling before explicit queue allowances.
export function integrationBudgetMs(mode, files, { liveArtifactQualification = false } = {}) {
  const base = liveArtifactQualification ? 600_000 : mode === 'full' ? 1_500_000
    : mode === 'selected' ? Math.min(1_500_000, Math.max(360_000, new Set(files).size * 60_000)) : 180_000
  return base + integrationOwnerAllowanceMs(mode, files)
}

export function parseIntegrationArgs(argv, env = process.env) {
  let mode
  const files = []
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i], value = argv[++i]
    if (!['--mode', '--file'].includes(key)) throw new Error(`unknown argument: ${key}`)
    if (!value || value.startsWith('--')) throw new Error(`${key} requires a value`)
    if (key === '--mode') {
      if (mode) throw new Error('--mode may only be supplied once')
      mode = value
    } else files.push(value)
  }
  const selected = files.length ? files : JSON.parse(env.INTEGRATION_TEST_FILES || '[]')
  if (!Array.isArray(selected) || selected.some(name => typeof name !== 'string')) {
    throw new Error('INTEGRATION_TEST_FILES must be an array of integration test filenames')
  }
  mode ||= files.length ? 'selected' : env.INTEGRATION_TEST_MODE || (selected.length ? 'selected' : 'smoke')
  if (!['smoke', 'selected', 'full'].includes(mode)) throw new Error(`unknown integration mode: ${mode}`)
  return { mode, files: [...new Set(selected)] }
}

export function selectIntegrationFiles({ mode, files = [], availableFiles }) {
  if (!['smoke', 'selected', 'full'].includes(mode)) throw new Error(`unknown integration mode: ${mode}`)
  if (!Array.isArray(files) || files.some(name => typeof name !== 'string' || !/^[\w-]+\.test\.ts$/.test(name))) {
    throw new Error('--file accepts basenames ending in .test.ts from server/src/__integration__ only')
  }
  if (mode !== 'selected' && files.length) throw new Error(`${mode} mode cannot also select files`)
  if (mode === 'selected' && files.length === 0) throw new Error('selected mode requires a nonempty file list')
  const result = mode === 'full' ? availableFiles.toSorted() : mode === 'smoke' ? [...SMOKE_FILES] : [...new Set(files)]
  if (!result.length) throw new Error('integration selection is empty')
  const missing = result.filter(name => !availableFiles.includes(name))
  if (missing.length) throw new Error(`unknown or missing test file(s): ${missing.join(', ')}`)
  return result
}
