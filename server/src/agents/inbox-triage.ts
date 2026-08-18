import type { ContextRow, InboxRow, PersonaRow, WorklogEntry } from './runtime/client.js'
import { env } from '../env.js'
import { getTrackedLlmClient } from './llm-ledger.js'
import { inprocClient } from './runtime/inproc-client.js'
import { buildTriageRequest, parseTriage, finalizeTriage, isRateLimited, type InboxTriageVerdict, type ClaimsByConvo } from './triage-core.js'
import { recordTriage } from './observability.js'
import { usageFromOpenAI } from './cost.js'

export type { ResponseMode, InboxTriageVerdict } from './triage-core.js'
export { buildTriageRequest } from './triage-core.js'

/** Gather the active worklog claims for every conversation with an unread,
 *  non-system message — the authoritative "real work is happening here" signal fed into
 *  triage (`buildTriageRequest`). scopeKey = conversation_id, the exact scope
 *  `cumora claim --in <convo>` writes under. Best-effort per convo so a Redis
 *  hiccup on one conversation can't starve the whole gate. Shared by BOTH the
 *  cloud path (below) and the BYOA `/inbox-triage/payload` route so Cloud ≡ BYOA. */
export async function gatherClaimsByConvo(inbox: InboxRow[]): Promise<ClaimsByConvo> {
  const convoIds = [...new Set(inbox.filter((m) => m.kind !== 'system').map((m) => m.conversation_id))]
  const entries = await Promise.all(convoIds.map(async (cid) => {
    const held = await inprocClient.peekWorklog(cid).catch(() => [] as WorklogEntry[])
    return [cid, held] as const
  }))
  const out: ClaimsByConvo = {}
  for (const [cid, held] of entries) if (held.length) out[cid] = held
  return out
}

/** Cloud-agent inbox triage: build the request, run the cloud SMALL model,
 *  parse the verdict. BYOA agents do NOT use this — they fetch the built request
 *  from `/inbox-triage/payload` and run it on their LOCAL small model (Haiku /
 *  small Codex) so judgment never leaves the operator's machine and never spends
 *  cloud quota. The big brain is never spent on triage in either path. */
export async function classifyInboxTriage(args: {
  agentId: string
  companyId: string | null
  persona: PersonaRow
  inbox: InboxRow[]
  context: ContextRow[]
}): Promise<InboxTriageVerdict> {
  const [claimsByConvo, humanActiveInCompany] = await Promise.all([
    gatherClaimsByConvo(args.inbox),
    // Supervision signal for the loop cap: a human actively reading the company
    // keeps activity side-rooms (which the human may be excluded from by the
    // activity's own rules) on the HIGH backstop instead of the lap floor.
    args.companyId ? inprocClient.humanRecentlyActive(args.companyId).catch(() => false) : Promise.resolve(false),
  ])
  const req = buildTriageRequest({
    agentId: args.agentId,
    persona: args.persona,
    inbox: args.inbox,
    context: args.context,
    claimsByConvo,
    humanActiveInCompany,
  })
  if (req.verdict) return req.verdict
  // Tracked client → every triage call lands in llm_calls with purpose='inbox-triage'
  // alongside its agent_triages row, so spend rollups by purpose see this too.
  const client = await getTrackedLlmClient({
    purpose: 'inbox-triage',
    companyId: args.companyId,
    agentId: args.agentId,
    extras: { inboxCount: args.inbox.length },
  })

  try {
    const r = await client.responses.create({
      model: env.OPENAI_MODEL_SUPPORT,
      instructions: req.instructions,
      input: req.input,
      text: { format: { type: 'json_object' } },
      max_output_tokens: 500,
      reasoning: { effort: 'low' },
    }, {
      // Triage is a fast GATE. Do NOT retry — a rate-limited model retried (or
      // escalated to the big brain on fail-open) is exactly what burned users'
      // quota. ONE attempt, an 8s ceiling; on a rate-limit we fail CLOSED below.
      maxRetries: 0,
      timeout: 8_000,
    })
    const parsed = parseTriage(r.output_text ?? '{}')
    if (parsed) {
      const verdict = finalizeTriage(parsed, 'support-model')
      // Record the gate's cache-aware cost (fire-and-forget; never delay the gate).
      // A cloud triage is a cold one-shot — its input is billed uncached, which is
      // the whole reason this measurement exists.
      void recordTriage({
        agentId: args.agentId,
        companyId: args.companyId,
        source: 'cloud',
        model: env.OPENAI_MODEL_SUPPORT,
        actionable: verdict.actionable,
        reason: verdict.reason,
        usage: usageFromOpenAI(r.usage),
      })
      return verdict
    }
    throw new Error(`invalid triage JSON: ${(r.output_text ?? '').slice(0, 300)}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const status = (err as { status?: number } | null)?.status
    // CRITICAL: a rate-limit / quota / overload (429/503) must FAIL CLOSED, not
    // open. Fail-open wakes the expensive big brain to "decide" — which on a
    // throttled provider just burns more quota and trips the big brain's own
    // limit too (the runaway that drained accounts). Skip instead; the message
    // stays unread and is retried on the next wake/scan once the limit lifts.
    if (status === 429 || status === 503 || isRateLimited(msg)) {
      console.warn('[inbox-triage] classifier RATE-LIMITED — failing CLOSED (not waking the big brain):', msg)
      return { actionable: false, reason: `triage rate-limited (${msg.slice(0, 120)}); backing off`, promptNote: '', source: 'rate-limited' }
    }
    console.warn('[inbox-triage] classifier failed', msg)
    return {
      actionable: true,
      reason: 'classifier failed; fail open so the main brain can decide',
      promptNote:
        'Small-brain inbox triage failed, so fail open: read the inbox/context yourself. ' +
        'Do not silently ack unread human messages unless the thread clearly shows they are irrelevant or already handled.',
      source: 'fail-open',
    }
  }
}

/** Small-brain GATE for SYNTHETIC wakes — idle heartbeat, background scan, poll
 *  update. These are NOT human messages: no one is waiting on a reply. Per the
 *  cost principle (NEVER wake the expensive big brain without a cerebellum
 *  judgment first; avoid the big brain whenever possible), this decides whether
 *  there is a CONCRETE, TIMELY reason to act now — defaulting to NO. The big
 *  brain must never wake just to look around and conclude "nothing to do".
 *
 *  Fails CLOSED on ANY error (rate-limit, parse, network): unlike inbox triage
 *  there is no human to leave hanging, so skipping is always safe AND saves
 *  tokens — exactly the bias we want for unprompted wakes. */
export async function gateSyntheticWake(args: {
  companyId: string | null
  personaName: string
  kind: 'idle' | 'background_scan' | 'poll.updated'
  brief: string
  /** Caller-assembled signals: recent memory digest + recent thread context —
   *  the same material the idle/background turn judges on, so the gate isn't
   *  starved of context and doesn't reflexively kill genuine initiative. */
  signals: string
}): Promise<{ act: boolean; reason: string; note: string }> {
  const kindLabel = args.kind === 'idle' ? 'an idle heartbeat'
    : args.kind === 'background_scan' ? 'an internal background scan'
    : 'a poll update it is watching'
  const instructions =
    `You are Cumora's cerebellum — the cheap reflex gate that shields the EXPENSIVE big brain from being woken for nothing. ` +
    `Teammate "${args.personaName}" was woken by ${kindLabel}, NOT by a human message — NO ONE is waiting on a reply. ` +
    `Decide ONLY whether it is worth waking the big brain to ACT right now. DEFAULT IS NO. Set act=true ONLY if the signals show a ` +
    `CONCRETE, TIMELY, valuable reason to act now — a commitment that is actually due, a follow-up a human is genuinely waiting on, ` +
    `a poll that closed and needs its summary. Vague "might be nice to check in" / "could tidy up" is NOT enough; that wastes tokens. ` +
    `When in doubt, act=false.`
  const input = [
    `Agent: ${args.personaName}`,
    `Wake: ${kindLabel}`,
    args.brief ? `Brief: ${args.brief.slice(0, 600)}` : '',
    '',
    'Signals (recent memory + thread context):',
    args.signals.slice(0, 4000) || '  (nothing notable)',
    '',
    'Reply ONLY as strict JSON: {"act": boolean, "reason": "one short factual reason", "note": "if act is true, one sentence telling the big brain what to do; else empty"}.',
  ].filter(Boolean).join('\n')
  try {
    const client = await getTrackedLlmClient({
      purpose: 'synthetic-wake-gate',
      companyId: args.companyId,
      extras: { kind: args.kind, persona: args.personaName },
    })
    const r = await client.responses.create({
      model: env.OPENAI_MODEL_SUPPORT,
      instructions,
      input,
      text: { format: { type: 'json_object' } },
      max_output_tokens: 300,
      reasoning: { effort: 'low' },
    }, { maxRetries: 0, timeout: 8_000 })
    const parsed = JSON.parse(r.output_text ?? '{}') as { act?: unknown; reason?: unknown; note?: unknown }
    return {
      act: parsed.act === true,
      reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 300) : '',
      note: typeof parsed.note === 'string' ? parsed.note.slice(0, 500) : '',
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[synthetic-wake-gate] ${args.kind} gate failed — failing CLOSED (NOT waking the big brain):`, msg)
    return { act: false, reason: `gate failed (${msg.slice(0, 120)}); not waking the big brain`, note: '' }
  }
}
