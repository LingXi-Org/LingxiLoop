# Frozen currency presentation failure model

- A Pro embedding call records CNY 0.000070 / 1000 input tokens, but the trace drops its captured CNY amount and displays the converted USD amount with `$`.
- A root or child total sums different original currencies and incorrectly labels the sum CNY; a native span and its matching ledger row are charged twice.
- Reopening historical calls recalculates charges from today's rates/FX or renames ordinary BAAI/bge-m3 to Pro.
- Missing, malformed, unmeasured or unavailable original pricing appears as a known zero or a fabricated RMB amount.
- The public projection leaks arbitrary ledger extras rather than an allowlist of numeric original amount and registered billing metadata.
- The UI truncates tiny nonzero embedding amounts to zero, loses prices on replay, or claims provider invoice verification for token-based estimates.
- A display-only change rewrites settled rows, budget USD values, model configuration, dimensions or indexes.

Qualification uses synthetic provider responses and isolated SQL/browser fixtures only. No paid request, production binding inspection or historical ledger mutation is needed.
