# LingxiLoop

This is a stable web product. Follow the user's request to completion; ask only when an answer would materially change the outcome or the next action needs new authority. Repository edits do not authorize deployment, publishing, external messages, or destructive operations.

## Product invariants

- Keep Web/API and background workers separate. The browser web app is the supported release surface; Electron is local development only (`electron:dev/start`), with no installer packaging or publishing.
- PostgreSQL owns product state, WuKongIM durable IM, Redis ephemeral coordination, and vendored Open Notebook/SurrealDB its own schema.
- The old Agent OS and harness are retired. Use the exact published LingxiOS dependency through its public exports; do not restore vendored runtime code or invent a compatibility adapter. Keep product authorization and the shared LLM ledger intact.
- At every server trust boundary, enforce tenant and project authorization. Never expose or log credentials, tokens, or prompts; preserve signed callback/webhook checks.
- Keep web UI keyboard-accessible, visibly focused, semantically labelled, motion-reduced, and readable.

## Data and delivery

- `server/src/db/migrations/0001_v1_baseline.sql` is immutable. Add one next-numbered, transactional, forward-compatible migration; runtime code never executes DDL. A non-empty database without `schema_migrations` must be rebuilt by operations, never adopted by the app.
- Use the smallest owning check: web (`lint`, `typecheck`, `test`, `build`); admin/control (`admin:*`/`control:*`); server (`server:*` and affected integration); Open Notebook (its own affected package). Migration and runtime integration changes also require their owning integration coverage.
- Do not add or use Playwright for repository verification.
- Use Komodo's CLI/API update state for production deployment verification; never copy credentials into files or output.

## Testing

- Never write unit tests after you write code.
- Highly prefer E2E tests as the sole testing mechanism. Use them to verify complex features work. At the end of E2E tests, produce a verifiable and repeatable artifact.
- If you must test a system in isolation, first write down all the ways it could fail, then write the code.
