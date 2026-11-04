// Metadata only in the already running worker; no runtime/database is started.
import { releaseVersions } from '@lyyzka/lingxios'

const names = ['AGENT_OS_MAX_MODEL_CALLS', 'AGENT_OS_MAX_MODEL_TOKENS', 'AGENT_OS_MAX_MODEL_COST_MICROS', 'AGENT_OS_MAX_WORK_MS']
const configuration = Object.fromEntries(names.map(name => {
  const raw = process.env[name]?.trim(), value = raw ? Number(raw) : NaN
  return [name, Number.isSafeInteger(value) && value > 0 ? value : null]
}))
console.log(JSON.stringify({ status: 'observed', observationOnly: true, runtime: releaseVersions.runtime,
  configuration, scope: 'current_worker_environment_only', frozenRootLimits: 'unknown' }))
