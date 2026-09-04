/**
 * Bounded protocol-correction budgets.
 *
 * When the model violates the tool protocol (multiple calls, bad arguments,
 * invalid Python, withheld response), the runtime grants exactly one
 * correction turn *per category* rather than sharing a single flag across
 * unrelated failure modes. Budgets exist so a misbehaving model converges to
 * a hard failure instead of looping.
 */

export type CorrectionCategory =
  | 'tool_protocol' // multiple calls, malformed arguments, empty turn
  | 'kernel_error' // cell raised; one retry to fix the code
  | 'response_protocol' // final text violated the visible-response policy

export class CorrectionBudget {
  private readonly used = new Set<CorrectionCategory>()

  /**
   * Try to consume one correction for `category`. Returns true when the
   * correction turn is granted; false when the budget is exhausted and the
   * runtime must fail the run.
   */
  consume(category: CorrectionCategory): boolean {
    if (this.used.has(category)) return false
    this.used.add(category)
    return true
  }

  has(category: CorrectionCategory): boolean {
    return !this.used.has(category)
  }
}
