export const BRAND_AVATAR_BASE_EXPRESSION = 'upward-side-glance' as const
export const BRAND_AVATAR_BLINK_EXPRESSION = 'sleepy-squint' as const
export const BRAND_AVATAR_ANGRY_EXPRESSION = 'angry-brows' as const
export const BRAND_AVATAR_IDLE_ANIMATION = 'brand-idle' as const
export const BRAND_AVATAR_SQUINT_ANIMATION = 'brand-squint' as const
export const BRAND_AVATAR_ANGRY_ANIMATION = 'brand-angry-shake' as const

export type BrandAvatarExpression =
  | typeof BRAND_AVATAR_BASE_EXPRESSION
  | typeof BRAND_AVATAR_BLINK_EXPRESSION
  | typeof BRAND_AVATAR_ANGRY_EXPRESSION

export type BrandAvatarTimer = ReturnType<typeof globalThis.setTimeout>

export type BrandAvatarScheduler = {
  setTimeout: (callback: () => void, delayMs: number) => BrandAvatarTimer
  clearTimeout: (timer: BrandAvatarTimer) => void
}

export type BrandAvatarControllerOptions = {
  now?: () => number
  scheduler?: BrandAvatarScheduler
}

const CLICK_REACTION_MS = 700
const MULTI_CLICK_WINDOW_MS = 1_500
const ANGRY_REACTION_MS = 2_500
const ANGRY_CLICK_COUNT = 4

const browserScheduler: BrandAvatarScheduler = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (timer) => globalThis.clearTimeout(timer),
}

export class BrandAvatarController {
  private readonly emitExpression: (expression: BrandAvatarExpression) => void
  private readonly now: () => number
  private readonly scheduler: BrandAvatarScheduler
  private clickTimes: number[] = []
  private reactionTimer: BrandAvatarTimer | null = null
  private angry = false
  private disposed = false
  private started = false
  private currentExpression: BrandAvatarExpression | null = null

  constructor(
    emitExpression: (expression: BrandAvatarExpression) => void,
    options: BrandAvatarControllerOptions = {},
  ) {
    this.emitExpression = emitExpression
    this.now = options.now ?? Date.now
    this.scheduler = options.scheduler ?? browserScheduler
  }

  start(): void {
    if (this.started || this.disposed) return
    this.started = true
    this.setExpression(BRAND_AVATAR_BASE_EXPRESSION)
  }

  registerClick(): void {
    if (!this.started || this.disposed || this.angry) return

    const now = this.now()
    this.clickTimes = this.clickTimes.filter((clickTime) => now - clickTime <= MULTI_CLICK_WINDOW_MS)
    this.clickTimes.push(now)
    this.clearReactionTimer()

    if (this.clickTimes.length >= ANGRY_CLICK_COUNT) {
      this.clickTimes = []
      this.angry = true
      this.setExpression(BRAND_AVATAR_ANGRY_EXPRESSION)
      this.reactionTimer = this.scheduler.setTimeout(() => {
        this.angry = false
        this.restoreBaseExpression()
      }, ANGRY_REACTION_MS)
      return
    }

    this.setExpression(BRAND_AVATAR_BLINK_EXPRESSION)
    this.reactionTimer = this.scheduler.setTimeout(() => this.restoreBaseExpression(), CLICK_REACTION_MS)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.clearReactionTimer()
    this.clickTimes = []
  }

  private restoreBaseExpression(): void {
    if (this.disposed) return
    this.reactionTimer = null
    this.setExpression(BRAND_AVATAR_BASE_EXPRESSION)
  }

  private setExpression(expression: BrandAvatarExpression): void {
    if (this.currentExpression === expression) return
    this.currentExpression = expression
    this.emitExpression(expression)
  }

  private clearReactionTimer(): void {
    if (this.reactionTimer === null) return
    this.scheduler.clearTimeout(this.reactionTimer)
    this.reactionTimer = null
  }

}
