# Isolated post-merge acceptance failure model

Written before new harness implementation. This harness never changes production.

- Wrong image/config/version: verify immutable image digest, installed exact package, schema migration, source and limits; fail on disagreement.
- Cross-environment data or credentials: use only explicitly named disposable containers, loopback ports, synthetic fixtures and existing test secrets. No dotenv developer/provider/operator configuration. Never use real user data or a paid provider.
- Non-comparable measurements: record identical limits, database fixture and workload; alternate baseline/candidate phases; exclude concurrent browser/load work. Keep image/runtime differences explicit. Synthetic model latency is not real provider latency.
- Observability changes measurements: inject the same external observer into both immutable images; record instrumentation and GC/profile overhead. Capture heap snapshots only in disposable processes; publish aggregate counts, not raw strings/prompts/secrets.
- False soak pass: append timestamped heartbeats, monotonic time, restart/exit state, queues and failures. Require a full 86,400 seconds, intact heartbeat continuity, and explicit terminal receipt. Missing/stopped executor, partial duration, missing samples or disappeared containers mean incomplete/failure.
- Silent backend faults: test separate Web/Worker restart and short disposable PostgreSQL interruption; compare readiness/liveness, durable rows and next-message success. Restore only named test resources in finally/cleanup.
- Authentication bypass mistaken for complete SPA coverage: use the actual Worker, local D1, signed gateway, PostgreSQL identity/session checks and full React entry. If external Turnstile cannot run, report login blocked; any pre-created synthetic session tests qualify post-login/session-expiration only, not login/captcha.
- Duplicate business writes: count actual durable messages/actions by original nonce, not a Set or inferred UI state; check no cross-user replay after expiry/relogin.
- False issue closure: map every issue acceptance item to concrete artifacts or a named remaining blocker; real provider, production canary and Komodo update state remain external gates until executed.
