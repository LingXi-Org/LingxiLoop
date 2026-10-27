import { databasePlan, orderedTargets, requireThat, type Manifest, type TargetId } from '../../../shared/release/protocol'

// These are business checkpoints, not quota-driven slices. A completed stage
// has its own evidence and cannot be repeated under a fresh request allowance.
export type ReleaseStage = { key: string; kind: 'batch' | 'manifest' | 'prepare' | 'claim' | 'host' | 'worker' | 'probe' | 'finish'; targets?: TargetId[]; host?: string; phase?: string; recovery?: boolean }
export type StageCheckpoint = {
  protocol: 2; plan: ReleaseStage[]; index: number; serial: number
  changed: TargetId[]; mutationSubmitted: boolean; sourceRecoveryQualified?: boolean
  sourceDrainReuse?: { stage: string; generation: number; operationKeys: string[] }
  direction: 'forward' | 'source' | 'compatible-recovery'
  requests: Record<string, number>; deadlines: Record<string, number>
  retries?: Record<string, number>
  timings?: Record<string, { queuedAt: number; startedAt?: number; completedAt?: number; lastError?: string }>
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
  const runtime = targets.filter(id => manifest.targets[id]!.adapter === 'main-runtime')
  let preparedRuntime = false
  for (const target of targets) {
    if(runtime.includes(target)) {
      if(preparedRuntime)continue
      // Independent generation-zero cache work can overlap; the existing
      // all-host settle barrier still precedes claim/drain and every DB write.
      plan.push({key:`prepare-${runtime.join('-')}`,kind:'prepare',targets:runtime});preparedRuntime=true
    }else plan.push({ key: `prepare-${target}`, kind: 'prepare', targets: [target] })
  }
  plan.push({ key: 'claim', kind: 'claim' })
  const maintenance = runtime.some(id => manifest.targets[id]!.hostPlan?.mode !== 'rolling')
  let runtimeDone = false
  const host = (ids: TargetId[], phase: string) => plan.push({ key: `${phase}-${ids.join('-')}`, kind: 'host', targets: ids, phase })
  for (const id of targets) {
    const t = manifest.targets[id]!
    if (t.adapter === 'main-runtime' && maintenance) {
      if (runtimeDone) continue
      requireThat(runtime.includes('main-runtime-a') && runtime.includes('main-runtime-b'), 'MAINTENANCE_REQUIRES_BOTH_NODES')
      host(runtime, 'drain')
      const database = databasePlan(manifest.targets['main-runtime-a']!)
      if (database) for (const phase of database.rpo === 'test-data-no-backup' ? ['migrate'] : ['backup', 'restore-verify', 'migrate']) host(['main-runtime-a'], phase)
      for (const target of runtime) { host([target], 'apply'); host([target], 'verify') }
      host(runtime, 'undrain'); runtimeDone = true
    } else if (t.artifact.kind === 'worker') plan.push({ key: `activate-${id}`, kind: 'worker', targets: [id] })
    else for (const phase of ['drain', 'apply', 'verify', 'undrain']) host([id], phase)
  }
  return [...plan, ...verificationStages(manifest)]
}
// A known failed source preflight is not a dispatched CAS. This proof can only
// select restoration of the exact source; it cannot mark migration successful.
export function qualifyPreflightSourceRecovery(manifest:Manifest,checkpoint:StageCheckpoint,targets:Record<string,unknown>,manifestHash:string,generation:number):boolean {
 const current=checkpoint.plan[checkpoint.index]
 if(current?.kind!=='host'||current.phase!=='migrate'||current.targets?.join(',')!=='main-runtime-a'||!checkpoint.changed.length||checkpoint.changed.some(id=>manifest.targets[id]?.artifact.kind!=='image')||checkpoint.plan.slice(0,checkpoint.index).some(s=>s.kind==='worker'||s.kind==='host'&&['migrate','apply','recover'].includes(s.phase??'')))return false
 const op=targets['main-runtime-a:a:migrate'] as {key?:string;releaseId?:string;target?:string;phase?:string;manifestHash?:string;generation?:number;status?:string;errors?:{forward?:{code?:string}};result?:{complete?:boolean;sourceRestorationOnly?:boolean;migrationExecution?:string;manifestHash?:string;generation?:number;preflightRefusalObserved?:boolean};steps?:{name:string;status:string}[]}|undefined
 const proof=op?.result
 return op?.key===`${manifest.releaseId}:main-runtime-a:migrate`&&op.releaseId===manifest.releaseId&&op.target==='main-runtime-a'&&op.phase==='migrate'&&op.manifestHash===manifestHash&&op.generation===generation&&op.status==='failed'&&op.errors?.forward?.code==='DATABASE_SOURCE_CHANGED'&&op.steps?.length===1&&op.steps[0].name==='database:migrate'&&op.steps[0].status==='failed-known'&&proof?.complete===false&&proof.sourceRestorationOnly===true&&proof.migrationExecution==='not-attempted'&&proof.manifestHash===manifestHash&&proof.generation===generation&&proof.preflightRefusalObserved===true
}
export function recoveryStages(manifest: Manifest, checkpoint: StageCheckpoint): ReleaseStage[] {
  const source = (!checkpoint.mutationSubmitted || checkpoint.sourceRecoveryQualified===true) && checkpoint.changed.length > 0 && checkpoint.changed.every(id => manifest.targets[id]!.artifact.kind === 'image')
  const images = checkpoint.changed.filter(id => manifest.targets[id]!.artifact.kind === 'image')
  const plan: ReleaseStage[] = []
  if (images.length) plan.push({ key: 'recovery-isolate', kind: 'host', targets: images, phase: source ? 'source-drain' : 'recovery-drain' })
  for (const id of [...checkpoint.changed].reverse()) plan.push(manifest.targets[id]!.artifact.kind === 'worker'
    ? { key: `recover-${id}`, kind: 'worker', targets: [id], recovery: true }
    : { key: `recover-${id}`, kind: 'host', targets: [id], phase: source ? 'restore-source' : 'recover', recovery: true })
  if (images.length) plan.push({ key: 'recovery-admit', kind: 'host', targets: images, phase: source ? 'source-undrain' : 'recovery-undrain' })
  return [...plan, ...verificationStages({ ...manifest, targets: Object.fromEntries(checkpoint.changed.map(id => [id, manifest.targets[id]!])) }, true)]
}

export function qualifyDrainedSourceRecovery(manifest:Manifest,checkpoint:StageCheckpoint,targets:Record<string,unknown>,manifestHash:string,generation:number):boolean {
 const current=checkpoint.plan[checkpoint.index]
 if(checkpoint.direction!=='source'||checkpoint.mutationSubmitted||current?.kind!=='host'||current.phase!=='source-drain'||!checkpoint.changed.length)return false
 return checkpoint.changed.every(id=>{
  const target=manifest.targets[id]
  if(!id.startsWith('main-runtime-')||target?.artifact.kind!=='image'||target.hostPlan?.mode!=='maintenance'||!target.hosts.length)return false
  return target.hosts.every(host=>{
   const op=targets[`${id}:${host}:drain`] as {key?:string;releaseId?:string;target?:string;phase?:string;generation?:number;manifestHash?:string;status?:string;operationId?:string;result?:{drained?:boolean;mode?:string};steps?:{status:string}[]}|undefined
   return op?.key===`${manifest.releaseId}:${id}:drain`&&op.releaseId===manifest.releaseId&&op.target===id&&op.phase==='drain'&&op.generation===generation&&op.manifestHash===manifestHash&&op.status==='succeeded'&&!!op.operationId&&op.result?.drained===true&&op.result.mode==='maintenance'&&!!op.steps?.length&&op.steps.every(step=>step.status==='completed')
  })
 })
}
