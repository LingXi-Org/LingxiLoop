import { Journal, fault, hash, identifier, validateRequest } from './journal.mjs'
import { validateHostPlan,assertCompatible } from './adapter.mjs'

const safeError = error => ({ code: error.code ?? 'EXECUTION_FAILED', message: error.code ? error.message : 'Executor failed; inspect restricted local diagnostics',
  ...(error.sqlState && /^[A-Z0-9]{5}$/.test(error.sqlState) ? { sqlState: error.sqlState } : {}) })

export class Executor {
  constructor({ journal, adapter, afterSideEffect, log = () => {} }) {
    this.journal = journal; this.adapter = adapter; this.active = new Set(); this.afterSideEffect = afterSideEffect; this.log = log
    adapter.recordControlRead=(op,receipt)=>{
      const key=`${op.releaseId}:${op.target}:${op.phase}`,current=journal.get(key)
      if(!current || current.manifestHash!==op.manifestHash || current.generation!==op.generation)return
      const reads=current.errors.controlReads??{},old=reads[receipt.action]
      reads[receipt.action]={calls:(old?.calls??0)+1,attempts:(old?.attempts??0)+receipt.attempts,retries:(old?.retries??0)+receipt.retries,elapsedMs:(old?.elapsedMs??0)+receipt.elapsedMs,startedAt:old?.startedAt??receipt.startedAt,completedAt:receipt.completedAt,lastOutcome:receipt.outcome}
      journal.patch(key,{errors:{...current.errors,controlReads:reads}})
    }
  }
  register(manifest, manifestHash) {
    if (!manifest || manifest.version !== 1 || !identifier(manifest.releaseId) || !manifest.targets || !/^[a-f0-9]{40}$/.test(manifest.appSha ?? '') || !/^[a-f0-9]{40}$/.test(manifest.opsSha ?? '') || manifest.checks?.commit !== manifest.appSha || manifest.checks?.conclusion !== 'success' || !Number.isSafeInteger(manifest.sequence) || manifest.sequence < 1 || !Number.isFinite(Date.parse(manifest.createdAt)) || hash(manifest) !== manifestHash) throw fault('INVALID_MANIFEST', 'Manifest identity or canonical hash is invalid', 422)
    if (!this.adapter.policy.acceptedOpsShas.includes(manifest.opsSha)) throw fault('OPS_VERSION_MISMATCH','Manifest tool identity is not supported by this installed executor',409)
    let enabled = 0
    for (const target of Object.keys(manifest.targets)) if (this.adapter.policy.targets[target]) { validateHostPlan(manifest,target,this.adapter.policy); enabled++ }
    if (!enabled) throw fault('UNKNOWN_TARGET', 'Manifest has no locally enabled target', 422)
    return this.journal.register(manifest,manifestHash)
  }
  submit(request) {
    validateRequest(request)
    const manifest = this.journal.manifest(request.releaseId,request.manifestHash)
    const plan=validateHostPlan(manifest,request.target,this.adapter.policy),local=this.adapter.policy.targets[request.target]
    return this.journal.accept(request,this.adapter.resources(request.target,request.phase),{resumeUnstartedRecover:local.adapter==='main-runtime' && plan.mode==='maintenance' && !this.active.has(`${request.releaseId}:${request.target}:${request.phase}`)})
  }
  canResumeUnstartedRecoveryDrain(op) {
    return op?.phase==='recovery-drain' && op.status==='uncertain' && op.steps?.length===0 &&
      op.errors?.forward?.code==='CONFIGURATION_DIRECTION_UNPROVEN' && !this.active.has(op.key) &&
      this.adapter.policy.targets[op.target]?.adapter==='main-runtime' && Boolean(this.adapter.policy.targets[op.target].configurationFiles)
  }
  canObserveStoppedRecoveryDrain(op) {
    if(op?.phase!=='recovery-drain' || op.status!=='failed' || op.errors?.forward?.code!=='DRAIN_TIMEOUT' || this.active.has(op.key))return false
    const local=this.adapter.policy.targets[op.target],plan=this.journal.manifest(op.releaseId,op.manifestHash).targets[op.target]?.hostPlan
    if(local?.adapter!=='main-runtime' || plan?.mode!=='maintenance')return false
    const expected=new Set(['ingress-disable',...Object.keys(local.services).map(service=>`stop:${service}`)])
    if(op.steps.length!==expected.size || new Set(op.steps.map(step=>step.name)).size!==expected.size || !op.steps.every(step=>step.sideEffect===true && step.status==='completed' && expected.has(step.name)))return false
    return this.adapter.resources(op.target,op.phase).every(resource=>{
      const fence=this.journal.db.prepare('SELECT generation,release_id FROM fences WHERE resource=?').get(resource),lock=this.journal.db.prepare('SELECT operation_key FROM reservations WHERE resource=?').get(resource)
      return fence?.generation===op.generation && fence.release_id===op.releaseId && (!lock || lock.operation_key===op.key)
    })
  }
  async partialForwardEvidence(op,plan,record) {
    try {
      if(record?.releaseId!==op.releaseId || record.manifestHash!==op.manifestHash || record.generation!==op.generation || record.target!==op.target || record.phase!=='apply')throw Error('Unrelated operation')
      const local=this.adapter.policy.targets[op.target],groups={source:[],forward:[]},directions={}
      if(record.steps.some(step=>step.sideEffect && (step.status!=='completed' || /:up:/.test(step.name) && !Object.keys(local.services).some(service=>step.name===`forward:up:${service}`))))throw Error('Unknown service side effect')
      for(const service of Object.keys(local.services)){
        const steps=record.steps.filter(step=>step.sideEffect && step.name===`forward:up:${service}`)
        if(steps.length>1)throw Error('Ambiguous service history')
        const direction=steps.length?'forward':'source';groups[direction].push(service);directions[service]=direction
      }
      if(!groups.forward.length)throw Error('No completed forward service')
      const actual=await this.adapter.containers(op)
      for(const direction of ['source','forward'])if(groups[direction].length){const descriptor=direction==='source'?(plan.source??plan.recovery):plan;await this.adapter.configurationEvidence(op,descriptor,direction,actual,await this.adapter.resolveImages(descriptor.images,local),groups[direction])}
      return directions
    }catch{throw Object.assign(fault('CONFIGURATION_DIRECTION_UNPROVEN','Completed service history and actual image/environment do not prove a safe recovery direction'),{uncertain:true})}
  }
  async context(op) {
    const resources = this.adapter.resources(op.target,op.phase)
    const state=this.journal.state(op.target),local=this.adapter.policy.targets[op.target],plan=this.journal.manifest(op.releaseId,op.manifestHash).targets[op.target].hostPlan
    let currentDirection=state.appliedHash===op.manifestHash?state.appliedDirection:'source',serviceDirections
    if(local.configurationFiles&&op.phase!=='prepare'){
      const mutationPhases=['apply','recover','restore-source'],unproven=()=>Object.assign(fault('CONFIGURATION_DIRECTION_UNPROVEN','Current configuration cannot be inferred while a service update is unproven'),{uncertain:true})
      for(const pending of this.journal.unresolved())if(pending.target===op.target&&mutationPhases.includes(pending.phase)&&(pending.key!==op.key||pending.status==='uncertain'||pending.steps.some(s=>s.sideEffect&&/:up:/.test(s.name))))throw unproven()
      const applied=result=>result?.applied===true||result?.verified===true&&result.observedAfterInterruption===true
      const configuration=direction=>direction==='source'?(plan.source??plan.recovery):direction==='recovery'?plan.recovery:direction==='forward'?plan:null
      const performed=mutationPhases.map(phase=>this.journal.get(`${op.releaseId}:${op.target}:${phase}`)).filter(row=>row?.manifestHash===op.manifestHash&&(applied(row.result)||row.steps.some(s=>s.sideEffect&&/:up:/.test(s.name)))).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)),latest=performed.at(-1)
      if(latest?.status==='succeeded'&&applied(latest.result)&&configuration(latest.result.direction)&&configuration(latest.result.direction).configurationHash===latest.result.configurationHash)currentDirection=latest.result.direction
      else if(latest?.status==='failed'&&latest.result?.recovered===true&&latest.result.recovery?.applied===true&&latest.result.recovery.direction==='recovery'&&latest.result.recovery.configurationHash===plan.recovery.configurationHash)currentDirection='recovery'
      else if(latest?.phase==='apply' && latest.status==='failed' && (op.phase==='recovery-drain' || op.phase==='recover' && state.drainedHash===op.manifestHash && state.drainedGeneration===op.generation)){serviceDirections=await this.partialForwardEvidence(op,plan,latest);currentDirection='mixed'}
      else if(latest||state.appliedHash===op.manifestHash)throw unproven()
      else currentDirection='source'
    }
    const direction=local.configurationFiles?(op.phase==='prepare'?'source':currentDirection==='mixed'?'forward':currentDirection):'forward',descriptor=direction==='source'?(plan.source??plan.recovery):direction==='recovery'?plan.recovery:plan
    return {
      compose: await this.adapter.composeArgs(op,direction,descriptor),
      currentDirection,
      ...(serviceDirections?{serviceDirections,composeByService:Object.fromEntries(await Promise.all(Object.entries(serviceDirections).map(async([service,direction])=>[service,await this.adapter.composeArgs(op,direction,direction==='source'?(plan.source??plan.recovery):plan)])))}:{}),
      step: async (name, fn, { sideEffect = false } = {}) => {
        this.journal.assertFence(op.key,resources)
        if(['source-drain','restore-source','source-undrain'].includes(op.phase))await this.assertSourceRestoreAllowed(op)
        let current = this.journal.get(op.key)
        // Step records are evidence, never automatic instruction to retry an unknown side effect.
        if (current.steps.some(step => step.name === name)) throw fault('STEP_ALREADY_ATTEMPTED', 'An attempted step must be observed before another write')
        const step = { name, sideEffect, status: 'intent', startedAt: new Date().toISOString() }
        this.journal.patch(op.key,{ steps: [...current.steps,step] })
        let result
        try { result = await fn() } catch (error) {
          if(sideEffect&&error.outcomeKnown===true&&error.uncertain===false){const latest=this.journal.get(op.key);this.journal.patch(op.key,{steps:latest.steps.map(item=>item.name===name?{...item,status:'failed-known',completedAt:new Date().toISOString()}:item)})}
          else if(sideEffect)error.uncertain=true
          throw error
        }
        // Retain only the fixed ingress lost-response proof, never a helper's
        // full response, URL, headers or arbitrary diagnostic fields.
        if (result?.observedAfterUnknown === true && ['CONTROL_UNAVAILABLE','CONTROL_REJECTED'].includes(result.originalError?.code)) {
          const originalError = {code:result.originalError.code}
          if (Number.isInteger(result.originalError.httpStatus) && result.originalError.httpStatus >= 500 && result.originalError.httpStatus <= 599) originalError.httpStatus = result.originalError.httpStatus
          current = this.journal.get(op.key)
          this.journal.patch(op.key,{steps:current.steps.map(item => item.name === name ? {...item,observedAfterUnknown:true,originalError} : item)})
        }
        if (sideEffect) await this.afterSideEffect?.(name,op)
        this.journal.assertFence(op.key,resources)
        current = this.journal.get(op.key)
        this.journal.patch(op.key,{ steps: current.steps.map(item => item.name === name ? { ...item, status: 'completed', completedAt: new Date().toISOString() } : item) })
        return result
      },
    }
  }
  async run(key) {
    if (this.active.has(key)) return this.journal.get(key)
    const op = this.journal.get(key)
    const resumed=this.canResumeUnstartedRecoveryDrain(op)
    if (!op || op.status !== 'intent' && !resumed) return op
    this.active.add(key)
    if(!resumed)this.journal.patch(key,{ status: 'running' })
    let context
    try {
      const manifest = this.journal.manifest(op.releaseId,op.manifestHash), plan = validateHostPlan(manifest,op.target,this.adapter.policy)
      if (op.phase === 'observe') {
        const observed = []
        for (const pending of this.journal.unresolved().filter(row => row.target === op.target && row.key !== key && row.releaseId === op.releaseId)) {
          if (!this.active.has(pending.key)) observed.push(await this.reconcile(pending))
        }
        return this.journal.finish(key,'succeeded',{ operations: observed, needsIntervention: observed.some(row => row.status === 'uncertain') })
      }
      if(['source-drain','restore-source','source-undrain'].includes(op.phase))await this.assertSourceRestoreAllowed(op)
      if(resumed){
        this.journal.assertFence(op.key,this.adapter.resources(op.target,op.phase))
        context=await this.context(op)
        const fresh=this.journal.get(op.key)
        if(fresh.status!=='uncertain'||fresh.steps.length!==0||fresh.operationId!==op.operationId)throw Object.assign(fault('CONFIGURATION_DIRECTION_UNPROVEN','Only an untouched recovery drain can continue'),{uncertain:true})
        this.journal.assertFence(op.key,this.adapter.resources(op.target,op.phase))
        this.journal.patch(key,{status:'running'})
      }
      context ??= await this.context(op);const state = this.journal.state(op.target)
      let result
      switch (op.phase) {
        case 'prepare':
          result = await this.adapter.prepare(op,plan,context)
          this.journal.setState(op.target,{ ...this.journal.state(op.target), preparedHashes: { ...this.journal.state(op.target).preparedHashes, [op.manifestHash]: true } })
          break
        case 'drain': case 'recovery-drain': case 'source-drain':
          this.requirePrepared(op,state)
          result = await this.adapter.drain(op,plan,context)
          this.journal.setState(op.target,{ ...this.journal.state(op.target), drainedHash: op.manifestHash, drainedGeneration: op.generation })
          break
        case 'backup': case 'restore-verify': case 'migrate': {
          this.requirePrepared(op,state)
          if (!plan.database || state.drainedHash !== op.manifestHash || state.drainedGeneration !== op.generation) throw fault('DRAIN_REQUIRED','Database phases require this generation to prove maintenance drain')
          if (op.phase !== 'backup' && !state.backupHash?.[op.manifestHash]) throw fault('BACKUP_REQUIRED','A verified source backup is required before this database phase')
          if (op.phase === 'migrate' && !state.restoreVerifiedHash?.[op.manifestHash]) throw fault('RESTORE_VERIFY_REQUIRED','Isolated restore verification is required before migration')
          const action = op.phase === 'restore-verify' ? 'restoreVerify' : op.phase
          result = await context.step(`database:${action}`, () => this.adapter.control(this.adapter.policy.targets[op.target],action,op), { sideEffect:true })
          if (result?.complete !== true) throw fault('DATABASE_RECEIPT_INVALID','Fixed database helper has not proved completion')
          const current = this.journal.state(op.target)
          if (op.phase === 'backup') this.journal.setState(op.target,{ ...current,backupHash:{ ...current.backupHash,[op.manifestHash]:true } })
          if (op.phase === 'restore-verify') this.journal.setState(op.target,{ ...current,restoreVerifiedHash:{ ...current.restoreVerifiedHash,[op.manifestHash]:true } })
          for (const error of result.cleanupErrors ?? []) this.recordCleanupError(key,error)
          break
        }
        case 'apply': case 'recover': case 'restore-source':
          this.requirePrepared(op,state)
          if (state.drainedHash !== op.manifestHash || state.drainedGeneration !== op.generation) throw fault('DRAIN_REQUIRED', 'This generation must prove local drain before switching')
          if (op.phase === 'recover') await this.stopRecoveryWorkers(op,context)
          result = await this.adapter.apply(op,plan,context,op.phase==='restore-source'?'source':op.phase === 'recover' ? 'recovery' : 'forward')
          this.journal.setState(op.target,{ ...this.journal.state(op.target), appliedDirection: op.phase==='restore-source'?'source':op.phase === 'recover' ? 'recovery' : 'forward', appliedHash: op.manifestHash })
          break
        case 'verify':
          result = await this.adapter.verify(op,plan,state.appliedDirection ?? 'forward')
          break
        case 'undrain': case 'recovery-undrain': case 'source-undrain':
          result = await this.adapter.undrain(op,plan,context,op.phase==='source-undrain'?'source':op.phase === 'recovery-undrain' ? 'recovery' : state.appliedDirection ?? 'forward')
          this.journal.setState(op.target,{ ...this.journal.state(op.target), drainedHash: null, drainedGeneration: null })
          break
      }
      return this.journal.finish(key,'succeeded',result)
    } catch (error) {
      this.log({ key, code: error.code ?? 'EXECUTION_FAILED' })
      const current = this.journal.get(key), errors = current.errors
      if(resumed && current.status==='uncertain')return this.journal.finish(key,'uncertain',{needsIntervention:true,observationRequired:true,observationError:safeError(error)},errors)
      errors[['recover','restore-source','source-drain','source-undrain'].includes(op.phase) ? 'recovery' : 'forward'] = safeError(error)
      // A subprocess may have exited after Docker accepted the write. Keep its reservations until observation proves completion.
      if (error.uncertain || current.steps.some(step => step.sideEffect && step.status === 'intent')) return this.journal.finish(key,'uncertain',{ needsIntervention: true, observationRequired: true },errors)
      if (op.phase === 'apply' && error.knownApplied) {
        try {
          const plan = validateHostPlan(this.journal.manifest(op.releaseId,op.manifestHash),op.target,this.adapter.policy)
          if(this.adapter.policy.targets[op.target].configurationFiles){
            // Health failure is not sufficient proof of configuration. Verify
            // each completed up against forward; untouched services must still
            // match source. Any unknown step or private metadata mismatch keeps
            // ownership instead of authorizing another up.
            try{
              await this.partialForwardEvidence(op,plan,this.journal.get(op.key))
            }catch(proofError){proofError.uncertain=true;throw proofError}
          }
          if(!context)throw Object.assign(fault('CONFIGURATION_DIRECTION_UNPROVEN','Original execution context is unavailable'),{uncertain:true})
          await this.stopRecoveryWorkers(op,context)
          const recovery = await this.adapter.apply(op,plan,context,'recovery')
          this.journal.setState(op.target,{ ...this.journal.state(op.target), appliedDirection: 'recovery', appliedHash: op.manifestHash })
          return this.journal.finish(key,'failed',{ recovered: true, recovery, needsIntervention: false },errors)
        } catch (recoveryError) {
          errors.recovery = safeError(recoveryError)
          return this.journal.finish(key,recoveryError.uncertain ? 'uncertain' : 'failed',{ recovered: false, needsIntervention: true },errors)
        }
      }
      return this.journal.finish(key,'failed',{ needsIntervention: true },errors)
    } finally { this.active.delete(key) }
  }
  async assertSourceRestoreAllowed(op) {
    const forbidden=this.journal.db.prepare("SELECT key FROM operations WHERE json_extract(body,'$.releaseId')=? AND json_extract(body,'$.manifestHash')=? AND json_extract(body,'$.phase') IN ('migrate','apply','recover') LIMIT 1").get(op.releaseId,op.manifestHash)
    if(forbidden)throw fault('SOURCE_RESTORE_FORBIDDEN','A migration/application/recovery intent exists for this manifest; exact-source restoration is no longer permitted')
    const plan=validateHostPlan(this.journal.manifest(op.releaseId,op.manifestHash),op.target,this.adapter.policy),source=plan.source??plan.recovery,state=await this.adapter.state(op)
    assertCompatible(source.contract,state)
    if(state.nativeSchema!==source.contract.nativeSchema||state.productSchema!==source.contract.productSchema||source.contract.lingxios&&state.runtime!==source.contract.lingxios)throw fault('SOURCE_STATE_CHANGED','Installed state no longer exactly matches the original source')
    if(source.contract.migrations&&hash(source.contract.migrations)!==hash((state.migrations??[]).map(({version,checksum})=>({version,checksum}))))throw fault('SOURCE_STATE_CHANGED','Installed migration checksums no longer match the original source')
  }
  requirePrepared(op,state) { if (!state.preparedHashes?.[op.manifestHash]) throw fault('PREPARE_REQUIRED', 'Target and compatible recovery artifacts must be prepared before drain/apply') }
  async stopRecoveryWorkers(op,context) {
    if (this.adapter.policy.targets[op.target].adapter !== 'main-runtime') return
    // Check state compatibility before stopping anything; apply checks it again immediately before replacement.
    const plan = validateHostPlan(this.journal.manifest(op.releaseId,op.manifestHash),op.target,this.adapter.policy)
    const { assertCompatible } = await import('./adapter.mjs')
    assertCompatible(plan.recovery.contract,await this.adapter.state(op))
    const local = this.adapter.policy.targets[op.target], actual = await this.adapter.containers(op)
    const compose = await this.adapter.composeArgs(op,'recovery',plan.recovery)
    for (const [service,spec] of Object.entries(local.services)) if (spec.role === 'worker' && actual[service].State.Running) {
      await context.step(`recovery:stop:${service}`, () => this.adapter.run([...compose,'stop','--timeout',String(this.adapter.policy.stopTimeoutSeconds ?? 150),service]), { sideEffect: true })
    }
    if (plan.mode === 'rolling' && !await this.adapter.barrier(op)) throw fault('DRAIN_UNPROVEN','Recovery requires the actual task/lease barrier')
  }
  async reconcile(op) {
    if (this.active.has(op.key)) return this.journal.get(op.key)
    try {
      const plan = validateHostPlan(this.journal.manifest(op.releaseId,op.manifestHash),op.target,this.adapter.policy)
      const result = await this.adapter.observe(op,plan), state = this.journal.state(op.target)
      if (op.phase === 'backup') this.journal.setState(op.target,{ ...state,backupHash:{ ...state.backupHash,[op.manifestHash]:true } })
      if (op.phase === 'restore-verify') this.journal.setState(op.target,{ ...state,restoreVerifiedHash:{ ...state.restoreVerifiedHash,[op.manifestHash]:true } })
      if (op.phase === 'prepare') this.journal.setState(op.target,{ ...this.journal.state(op.target), preparedHashes: { ...this.journal.state(op.target).preparedHashes, [op.manifestHash]: true } })
      if (['drain','recovery-drain','source-drain'].includes(op.phase)) this.journal.setState(op.target,{ ...this.journal.state(op.target), drainedHash: op.manifestHash, drainedGeneration: op.generation })
      if (['apply','recover','restore-source'].includes(op.phase)) this.journal.setState(op.target,{ ...this.journal.state(op.target), appliedHash: op.manifestHash, appliedDirection: op.phase==='restore-source'?'source':op.phase === 'recover' ? 'recovery' : 'forward' })
      if (['undrain','recovery-undrain','source-undrain'].includes(op.phase)) this.journal.setState(op.target,{ ...this.journal.state(op.target), drainedHash: null, drainedGeneration: null })
      for (const error of result.cleanupErrors ?? []) this.recordCleanupError(op.key,error)
      return this.journal.finish(op.key,'succeeded',{ ...result, observedAfterInterruption: true })
    } catch (error) {
      return this.journal.finish(op.key,'uncertain',{ needsIntervention: true, observationRequired: true, observationError: safeError(error) })
    }
  }
  async reconcileStartup() {
    // Do not replay even an intent: it may have reached Docker before the crash.
    for (const op of this.journal.unresolved()) if (op.phase !== 'observe') await this.reconcile(op)
  }
  recordCleanupError(key,error) {
    const op = this.journal.get(key)
    return this.journal.patch(key,{ errors: { ...op.errors, cleanup: [...op.errors.cleanup,safeError(error)] } })
  }
}
export { Journal }
