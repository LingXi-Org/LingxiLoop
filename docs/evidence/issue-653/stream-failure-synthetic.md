# Formal23 incomplete stream: synthetic diagnosis

The retained formal-package failure contains structural counters and public
stage/ACK diagnostics, not raw arguments. Its missing finish/DONE markers alone
do not identify which side stopped the stream. The original observer did not
record reader EOF/error/cancellation, so this distinction cannot be recovered
retroactively without inventing evidence.

| Evidence | Formal23 failed run | Synthetic invalid replacement | Synthetic transport failure |
|---|---|---|---|
| Native tool fragments | present | present | present |
| Normal finish/DONE consumed | absent | absent | absent |
| Model output callbacks |1|1|not a Worker/ACK test|
| Publication attempts / ACK |0/0|0/0|not exercised|
| SDK classification |provider/unknown|provider/unknown|not a Worker classification test|
| Reader ending |not recorded|consumer-cancelled|transport-error (socket flag)|

The synthetic product fixture uses the actual formal23 Worker, real local
PostgreSQL, product authorization and the shared ledger. A model proposes a
replacement referring to a nonexistent source. The runtime's source validation
rejects it inside the output-operation callback before the first publication
attempt. The SDK wraps that callback failure as provider/unknown; cancellation
then leaves a partial native stream with no consumed finish marker. It produces
no sealed message or successful result and does not execute a business action.

This establishes a reproducible attribution blind spot, not the exact operation
or underlying exception of the historical live failure. It demonstrates why
that failure must not be labelled a confirmed supplier disconnect. The normal
append, delayed ACK and rejected-seal controls continue to pass; no protocol
validation, source validation, idempotency or retry policy is relaxed.

The test-only observer now forwards every original byte through a reader that
separately records EOF, underlying read error or downstream cancellation. Its
fixed flags can distinguish a known socket error from consumer cancellation;
raw error reasons, text, headers, tool definitions and arguments are not emitted.
A consumer cancellation alone is not failure proof: a normal SDK reader may stop
after DONE. Interpret it with finish/DONE counters and the run outcome.
Unit cases cover both endings, split UTF8, cleanup failure, exact endpoint scope
and private-value exclusion. No new real paid requests were issued.

Upstream follow-up can use this deterministic callback rejection to improve safe
failure attribution while retaining source fencing and bounded corrections.
The actual live root cause remains undetermined with the retained evidence;
the production release gate remains held. Another real run requires its own
explicit authorization and a matching formal candidate, not an automatic retry.
