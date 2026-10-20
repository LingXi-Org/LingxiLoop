# Reviewed recovery after inspect native failure

Previous inspect app output completed, but native RunStackService ended Complete/success=false after180739ms. No content migration/reindex was performed. Do not reinterpret or overwrite that receipt. New independent guard verified exact3config hashes and4containers unchanged.

- Preserve original code/schema/approval/receipt; recovery has a separate v2 output namespace, write-once outputs, exact new code+schema hash binding and new successful inspect required before execute.
- Final application success may only follow completed runtime/Redis/PG cleanup; require final.cleanupComplete=true. No forced process.exit to conceal cleanup. Native success and exact terminal readback remain mandatory.
- Increased512call ceiling is bounded; code must reject insufficient conservative execution budget before content mutation.540projected rows/2MiB cap covers bounded progress; fixed schema sanitizer still rejects extra keys, strings/IDs/content.
- Intermediate cleanup-progress can be pending/complete/failed as exact schema permits; only a final unique last complete plus cleanupComplete=true qualifies. Failure/uncertain partial progress remains retained. Never convert cleanup failure or truncated output into success.
- All existing scope authorization, source/epoch/fence checks remain in public APIs. Retry inspect only after previous native terminal known; execute no automatic retry. Original four-service policy/health verified before and after successful maintenance.
