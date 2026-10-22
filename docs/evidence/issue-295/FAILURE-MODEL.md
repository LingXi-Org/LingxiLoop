# Diagnostic placeholders: failure model

Written before implementation; synthetic data only.

- Queued/leased state or reset without answer text keeps running status and typing animation, without synthesized status prose.
- Real answer chunks, explicit public process and tool receipts remain visible and ordered through stream updates, reconnect and replay.
- Stored observed-progress commentary never reappears in summaries, expanded RunActivity or nested messages. Filter recorded identity, never arbitrary human/model prose or language. Stored history is unchanged.
- Partial/failed/cancelled replies retain native status and useful errors/approvals; removing diagnostics must not manufacture success.
- Waterfall metrics and real tool input/output remain. Missing optional fields, implementation details and timing-baseline footnotes do not become debug placeholders.
- No wire-schema changes, fabricated data or production/private reads. Timing/usage correctness is independent issue #296.
