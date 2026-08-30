import assert from 'node:assert/strict'
import test from 'node:test'
import avatarDefinition from '@/assets/lingxiloop.avatar.json'
import {
  BRAND_AVATAR_ANGRY_ANIMATION,
  BRAND_AVATAR_ANGRY_EXPRESSION,
  BRAND_AVATAR_BASE_EXPRESSION,
  BRAND_AVATAR_BLINK_EXPRESSION,
  BRAND_AVATAR_IDLE_ANIMATION,
  BrandAvatarController,
  type BrandAvatarScheduler,
  type BrandAvatarTimer,
} from './brand-avatar-controller'

class FakeScheduler implements BrandAvatarScheduler {
  now = 0
  private nextId = 1
  private readonly timers = new Map<number, { callback: () => void; dueAt: number }>()

  setTimeout(callback: () => void, delayMs: number): BrandAvatarTimer {
    const id = this.nextId++
    this.timers.set(id, { callback, dueAt: this.now + delayMs })
    return id as unknown as BrandAvatarTimer
  }

  clearTimeout(timer: BrandAvatarTimer): void {
    this.timers.delete(timer as unknown as number)
  }

  advanceBy(durationMs: number): void {
    const target = this.now + durationMs
    while (true) {
      const next = [...this.timers.entries()]
        .filter(([, timer]) => timer.dueAt <= target)
        .sort((left, right) => left[1].dueAt - right[1].dueAt)[0]
      if (!next) break
      const [id, timer] = next
      this.timers.delete(id)
      this.now = timer.dueAt
      timer.callback()
    }
    this.now = target
  }

  pendingCount(): number {
    return this.timers.size
  }
}

function setup() {
  const scheduler = new FakeScheduler()
  const expressions: string[] = []
  const controller = new BrandAvatarController((expression) => expressions.push(expression), {
    now: () => scheduler.now,
    scheduler,
  })
  controller.start()
  return { controller, expressions, scheduler }
}

test('starts from the upward glance while the native idle timeline owns blinking', () => {
  const { expressions, scheduler } = setup()
  const idle = avatarDefinition.animations[BRAND_AVATAR_IDLE_ANIMATION]

  assert.deepEqual(expressions, [BRAND_AVATAR_BASE_EXPRESSION])
  assert.equal(scheduler.pendingCount(), 0)
  assert.equal(idle.playbackMode, 'loop')
  assert.deepEqual(idle.steps.map((step) => step.expression), [BRAND_AVATAR_BASE_EXPRESSION])
  assert.deepEqual(idle.blink, {
    enabled: true,
    initialDelayMs: 2600,
    minIntervalMs: 3400,
    maxIntervalMs: 6200,
    durationMs: 280,
  })
})

test('a click holds the sleepy squint before returning to idle blinking', () => {
  const { controller, expressions, scheduler } = setup()

  controller.registerClick()
  scheduler.advanceBy(699)
  assert.equal(expressions.at(-1), BRAND_AVATAR_BLINK_EXPRESSION)
  scheduler.advanceBy(1)

  assert.equal(expressions.at(-1), BRAND_AVATAR_BASE_EXPRESSION)
  assert.equal(scheduler.pendingCount(), 0)
})

test('clicking an already closed expression extends it without flashing through idle', () => {
  const { controller, expressions, scheduler } = setup()

  controller.registerClick()
  scheduler.advanceBy(300)
  controller.registerClick()

  assert.deepEqual(expressions, [BRAND_AVATAR_BASE_EXPRESSION, BRAND_AVATAR_BLINK_EXPRESSION])
  scheduler.advanceBy(699)
  assert.equal(expressions.at(-1), BRAND_AVATAR_BLINK_EXPRESSION)
  scheduler.advanceBy(1)
  assert.equal(expressions.at(-1), BRAND_AVATAR_BASE_EXPRESSION)
})

test('four clicks inside the rolling window trigger and hold angry brows', () => {
  const { controller, expressions, scheduler } = setup()

  for (let click = 0; click < 4; click += 1) {
    controller.registerClick()
    scheduler.advanceBy(300)
  }

  assert.equal(expressions.at(-1), BRAND_AVATAR_ANGRY_EXPRESSION)
  controller.registerClick()
  scheduler.advanceBy(2_199)
  assert.equal(expressions.at(-1), BRAND_AVATAR_ANGRY_EXPRESSION)
  scheduler.advanceBy(1)
  assert.equal(expressions.at(-1), BRAND_AVATAR_BASE_EXPRESSION)
})

test('clicks outside the rolling window do not accumulate into anger', () => {
  const { controller, expressions, scheduler } = setup()

  for (let click = 0; click < 4; click += 1) {
    controller.registerClick()
    scheduler.advanceBy(1_501)
  }

  assert.equal(expressions.includes(BRAND_AVATAR_ANGRY_EXPRESSION), false)
})

test('dispose clears pending reactions', () => {
  const { controller, expressions, scheduler } = setup()
  controller.registerClick()

  controller.dispose()
  scheduler.advanceBy(10_000)

  assert.deepEqual(expressions, [BRAND_AVATAR_BASE_EXPRESSION, BRAND_AVATAR_BLINK_EXPRESSION])
  assert.equal(scheduler.pendingCount(), 0)
})

test('the browser scheduler can dispose without an unbound timer invocation', () => {
  const controller = new BrandAvatarController(() => undefined)
  controller.start()

  assert.doesNotThrow(() => controller.dispose())
})

test('the angry brand animation continuously renders the source shake motion', () => {
  assert.equal(avatarDefinition.expressions[BRAND_AVATAR_ANGRY_EXPRESSION].motion.body, 'shake')
  assert.deepEqual(
    avatarDefinition.animations[BRAND_AVATAR_ANGRY_ANIMATION].steps.map((step) => step.expression),
    [BRAND_AVATAR_ANGRY_EXPRESSION],
  )
  assert.equal(avatarDefinition.animations[BRAND_AVATAR_ANGRY_ANIMATION].playbackMode, 'loop')
  assert.equal(avatarDefinition.animations[BRAND_AVATAR_ANGRY_ANIMATION].steps[0]?.transition, 'smooth')
  assert.equal(avatarDefinition.animations[BRAND_AVATAR_ANGRY_ANIMATION].steps[0]?.transitionMs, 420)
})
