# Education-plan read-only prerequisite

This preparation does not execute a production request. The parent alone may run
the reviewed wrapper after supplying the actual sealed plan and accepted source.

- A future merge can change the seed definition: bind seven source files at
  accepted 7fe and reviewed f749, then require the actual target to have exactly
  those bytes. Do not invoke `ensureEducationPlan`, including during generation.
- Missing rows and changed canonical fields must fail independently. Only the
  one plan, eight entitlements and eight associations actually upserted are
  inspected. Unrelated rows are outside this prerequisite.
- SQL must be a bounded read-only transaction, use fully qualified table names,
  disable silent RLS filtering, and return one aggregate marker. Never return
  row contents, environment, credentials or raw native logs.
- A native acknowledgement, wrong Stack/operation, duplicate marker, changed
  terminal timestamp, missing result, or failed fresh read cannot pass. Unknown
  outcomes stop further network calls and are never automatically retried.
- Create the receipt exclusively before any request; persist native pending IDs.
  All output/error messages are fixed metadata, not untrusted reply text.
- Before and after the one Core query, reuse the frozen public host/config/image
  and container guards; compare the accepted four identities and policies.
  Config/environment values stay in memory; persist only canonical hashes.
- A passing snapshot is not a concurrency lock. Final validation requires the
  seed to finish before release execution, within 30 minutes of its start.
  A long subsequent backup does not age it against the final verifier clock.
- Seed is a separate native operation, not one of the release driver's 43.
  The final collector must freshly reread its exact ID and compare the terminal
  and aggregate marker to the saved receipt.
- Pre-seed loading cannot require the receipt it is about to create. Use the
  explicit pre-seed loader, which retains every plan/source/audit/CI check and
  accepts only the fixed seed receipt path with an explicitly pending null hash.
  Final loading still requires the actual receipt and its real hash. Both
  stages use `seed/receipt.json`; neither invents a successful placeholder.
- Failure receipts are retained. An existing file cannot be reused as a retry.
  The script does not stop/deploy services, stage Compose, pull images, change
  config, run migrations, call a provider, or run backup/restore.

Offline checks cover aggregate parsing, exact terminal identity, contradictory
fresh replies, drift, artifact binding and timing. They are not a production
database result or a native14 migration/restore qualification.
