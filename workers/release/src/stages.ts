import { databasePlan, orderedTargets, requireThat, type Manifest, type TargetId } from '../../../shared/release/protocol'

// These are business checkpoints, not quota-driven slices. A completed stage
// has its own evidence and cannot be repeated under a fresh request allowance.
export type ReleaseStage = { key: string; kind: 'batch' | 'manifest' | 'prepare' | 'claim' | 'host' | 'worker' | 'probe' | 'finish'; targets?: TargetId[]; host?: string; phase?: string; recovery?: boolean }
export type StageCheckpoint = {
  protocol: 2; plan: ReleaseStage[]; index: number; serial: number
  changed: TargetId[]; mutationSubmitted: boolean
  direction: 'forward' | 'source' | 'compatible-recovery'
  requests: Record<string, number>; deadlines: Record<string, number>
  completed: { key: string; workflowId: string; requests: number }[]
  previousWorkflowId?: string; initializedWorkflowId?: string; legacyVerificationOnly?: boolean
}
export const STAGE_REQUEST_LIMIT = 32
export const stageWorkflowId = (hash: string, serial: number) => `release-${hash.slice(7, 31)}-${serial}`
export function verificationStages(manifest: Manifest, recovery = false): ReleaseStage[] {
  return [...orderedTargets(manifest).map(target => ({ key: `${recovery ? 'recovery-' : ''}probe-${target}`, kind: 'probe' as const, targets: [target], recovery })), { key: recovery ? 'recovered' : 'accepted', kind: 'finish', recovery }]
}
export function forwardStages(manifest: Manifest): ReleaseStage[] {
  const targets = orderedTargets(manifest)
  const plan: ReleaseStage[] = [{ key: 'batch', kind: 'batch' }]
  for (const host of [...new Set(targets.flatMap(id => manifest.targets[id]!.hosts))]) plan.push({ key: `manifest-${host}`, kind: 'manifest', host })
  for (const target of targets) plan.push({ key: `prepare-${target}`, kind: 'prepare', targets: [target] })
  plan.push({ key: 'claim', kind: 'claim' })
  const runtime = targets.filter(id => manifest.targets[id]!.adapter === 'main-runtime')
  const maintenance = runtime.some(id => manifest.targets[id]!.hostPlan?.mode !== 'rolling')
  let runtimeDone = false
  const host = (ids: TargetId[], phase: string) => plan.push({ key: `${phase}-${ids.join('-')}`, kind: 'host', targets: ids, phase })
  for (const id of targets) {
    const t = manifest.targets[id]!
    if (t.adapter === 'main-runtime' && maintenance) {
      if (runtimeDone) continue
      requireThat(runtime.includes('main-runtime-a') && runtime.includes('main-runtime-b'), 'MAINTENANCE_REQUIRES_BOTH_NODES')
      host(runtime, 'drain')
      if (databasePlan(manifest.targets['main-runtime-a']!)) for (const phase of ['backup', 'restore-verify', 'migrate']) host(['main-runtime-a'], phase)
      for (const target of runtime) { host([target], 'apply'); host([target], 'verify') }
      host(runtime, 'undrain'); runtimeDone = true
    } else if (t.artifact.kind === 'worker') plan.push({ key: `activate-${id}`, kind: 'worker', targets: [id] })
    else for (const phase of ['drain', 'apply', 'verify', 'undrain']) host([id], phase)
  }
  return [...plan, ...verificationStages(manifest)]
}
export function recoveryStages(manifest: Manifest, checkpoint: StageCheckpoint): ReleaseStage[] {
  const source = !checkpoint.mutationSubmitted && checkpoint.changed.length > 0 && checkpoint.changed.every(id => manifest.targets[id]!.artifact.kind === 'image')
  const images = checkpoint.changed.filter(id => manifest.targets[id]!.artifact.kind === 'image')
  const plan: ReleaseStage[] = []
  if (images.length) plan.push({ key: 'recovery-isolate', kind: 'host', targets: images, phase: source ? 'source-drain' : 'recovery-drain' })
  for (const id of [...checkpoint.changed].reverse()) plan.push(manifest.targets[id]!.artifact.kind === 'worker'
    ? { key: `recover-${id}`, kind: 'worker', targets: [id], recovery: true }
    : { key: `recover-${id}`, kind: 'host', targets: [id], phase: source ? 'restore-source' : 'recover', recovery: true })
  if (images.length) plan.push({ key: 'recovery-admit', kind: 'host', targets: images, phase: source ? 'source-undrain' : 'recovery-undrain' })
  return [...plan, ...verificationStages({ ...manifest, targets: Object.fromEntries(checkpoint.changed.map(id => [id, manifest.targets[id]!])) }, true)]
}
