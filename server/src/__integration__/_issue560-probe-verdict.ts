// Test-only classification. Copy beside the Loop integration fixtures.
// Runtime failure/terminal notification is not verified artifact delivery.
export function issue560ProbeVerdict(input: {
  saved: boolean; authorizedReadback: boolean; referenceDelivered: boolean;
  accepted: boolean; protocolRejected: boolean; calls: number; probeCallLimit: number;
  budgetLimit?: { code?: unknown; dimension?: unknown } | null;
}) {
  if (input.saved && input.authorizedReadback && input.referenceDelivered && input.accepted) return 'delivered' as const
  if (input.protocolRejected) return 'protocol_rejected' as const
  if (input.budgetLimit?.code === 'budget_limit' && input.budgetLimit.dimension === 'calls'
    && input.calls === input.probeCallLimit) return 'inconclusive_probe_call_limit' as const
  // Missing diagnostics, or merely reaching the configured count, never proves
  // the precise terminal cause or an eventual success with a larger budget.
  return 'incomplete_unclassified' as const
}
