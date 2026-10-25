import { Journal, fault, hash, identifier, validateRequest } from './journal.mjs'
import { validateHostPlan } from './adapter.mjs'

const safeError = error => ({ code: error.code ?? 'EXECUTION_FAILED', message: error.code ? error.message : 'Executor failed; inspect restricted local diagnostics',
  ...(error.sqlState && /^[A-Z0-9]{5}$/.test(error.sqlState) ? { sqlState: error.sqlState } : {}) })

export class Executor {
  constructor({ journal, adapter, afterSideEffect, log = () => {} }) {
    this.journal = journal; this.adapter = adapter; this.active = new Set(); this.afterSideEffect = afterSideEffect; this.log = log
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
    validateHostPlan(manifest,request.target,this.adapter.policy)
    return this.journal.accept(request,this.adapter.resources(request.target,request.phase))
  }
  async context(op) {
    const resources = this.adapter.resources(op.target,op.phase)
    return {
      compose: await this.adapter.composeArgs(op,'forward'),
      step: async (name, fn, { sideEffect = false } = {}) => {
        this.journal.assertFence(op.key,resources)
        let current = this.journal.get(op.key)
        // Step records are evidence, never automatic instruction to retry an unknown side effect.
        if (current.steps.some(step => step.name === name)) throw fault('STEP_ALREADY_ATTEMPTED', 'An attempted step must be observed before another write')
        const step = { name, sideEffect, status: 'intent', startedAt: new Date().toISOString() }
        this.journal.patch(op.key,{ steps: [...current.steps,step] })
        let result
        try { result = await fn() } catch (error) { if (sideEffect) error.uncertain = true; throw error }
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
    if (!op || op.status !== 'intent') return op
    this.active.add(key)
    this.journal.patch(key,{ status: 'running' })
    try {
      const manifest = this.journal.manifest(op.releaseId,op.manifestHash), plan = validateHostPlan(manifest,op.target,this.adapter.policy)
      if (op.phase === 'observe') {
        const observed = []
        for (const pending of this.journal.unresolved().filter(row => row.target === op.target && row.key !== key && row.releaseId === op.releaseId)) {
          if (!this.active.has(pending.key)) observed.push(await this.reconcile(pending))
        }
        return this.journal.finish(key,'succeeded',{ operations: observed, needsIntervention: observed.some(row => row.status === 'uncertain') })
      }
      const context = await this.context(op), state = this.journal.state(op.target)
      let result
      switch (op.phase) {
        case 'prepare':
          result = await this.adapter.prepare(op,plan,context)
          this.journal.setState(op.target,{ ...this.journal.state(op.target), preparedHashes: { ...this.journal.state(op.target).preparedHashes, [op.manifestHash]: true } })
          break
        case 'drain': case 'recovery-drain':
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
        case 'apply': case 'recover':
          this.requirePrepared(op,state)
          if (state.drainedHash !== op.manifestHash || state.drainedGeneration !== op.generation) throw fault('DRAIN_REQUIRED', 'This generation must prove local drain before switching')
          if (op.phase === 'recover') await this.stopRecoveryWorkers(op,context)
          result = await this.adapter.apply(op,plan,context,op.phase === 'recover' ? 'recovery' : 'forward')
          this.journal.setState(op.target,{ ...this.journal.state(op.target), appliedDirection: op.phase === 'recover' ? 'recovery' : 'forward', appliedHash: op.manifestHash })
          break
        case 'verify':
          result = await this.adapter.verify(op,plan,state.appliedDirection ?? 'forward')
          break
        case 'undrain': case 'recovery-undrain':
          result = await this.adapter.undrain(op,plan,context,op.phase === 'recovery-undrain' ? 'recovery' : state.appliedDirection ?? 'forward')
          this.journal.setState(op.target,{ ...this.journal.state(op.target), drainedHash: null, drainedGeneration: null })
          break
      }
      return this.journal.finish(key,'succeeded',result)
    } catch (error) {
      this.log({ key, code: error.code ?? 'EXECUTION_FAILED' })
      const current = this.journal.get(key), errors = current.errors
      errors[op.phase === 'recover' ? 'recovery' : 'forward'] = safeError(error)
      // A subprocess may have exited after Docker accepted the write. Keep its reservations until observation proves completion.
      if (error.uncertain || current.steps.some(step => step.sideEffect && step.status === 'intent')) return this.journal.finish(key,'uncertain',{ needsIntervention: true, observationRequired: true },errors)
      if (op.phase === 'apply' && error.knownApplied) {
        try {
          const plan = validateHostPlan(this.journal.manifest(op.releaseId,op.manifestHash),op.target,this.adapter.policy), context = await this.context(op)
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
  requirePrepared(op,state) { if (!state.preparedHashes?.[op.manifestHash]) throw fault('PREPARE_REQUIRED', 'Target and compatible recovery artifacts must be prepared before drain/apply') }
  async stopRecoveryWorkers(op,context) {
    // Check state compatibility before stopping anything; apply checks it again immediately before replacement.
    const plan = validateHostPlan(this.journal.manifest(op.releaseId,op.manifestHash),op.target,this.adapter.policy)
    const { assertCompatible } = await import('./adapter.mjs')
    assertCompatible(plan.recovery.contract,await this.adapter.state(op))
    const local = this.adapter.policy.targets[op.target], actual = await this.adapter.containers(op)
    const compose = await this.adapter.composeArgs(op,'recovery')
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
      if (['drain','recovery-drain'].includes(op.phase)) this.journal.setState(op.target,{ ...this.journal.state(op.target), drainedHash: op.manifestHash, drainedGeneration: op.generation })
      if (['apply','recover'].includes(op.phase)) this.journal.setState(op.target,{ ...this.journal.state(op.target), appliedHash: op.manifestHash, appliedDirection: op.phase === 'recover' ? 'recovery' : 'forward' })
      if (['undrain','recovery-undrain'].includes(op.phase)) this.journal.setState(op.target,{ ...this.journal.state(op.target), drainedHash: null, drainedGeneration: null })
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
