# Production admission after control-plane migration

The user authorized production delivery of merged PRs164–175 and subsequent
fixes after the separate control-plane migration completed. This receipt records
the available preflight, not a successful production deployment.

The migration handoff reports txy3 as the current control-plane host, three
healthy nodes, eight running stacks, an empty pending set and successful backup
update `6ad33425e06d5e1f798292e9`. Those authenticated facts have **not been
independently re-read by this executor**. The repository's aly ownership prose is
stale; do not use it to overwrite the migrated resource configuration.

## Observed state

- Source main: `06ba56169ae8796bf6e067f4eecca0064145a816` (PR175 merged).
- Target public runtime:3.5.2, schema12, controlPlane11; product migration0043.
- Independent current full SPA session/human-message recovery:6/6, with
  [retained evidence](../spa-3.5.2/README.md). Captcha login, model-assisted SPA,
  complete product Worker and3.5.2 endurance are not claimed.
- `https://ops.christmas1314.xyz` returned HTTPS200 with TLS verification.
- Public production `/api/meta` returned commit
  `9332947e099d27b7716236a99604fc548059f6ad`, runtime3.4.7/schema11.
  Health and dependency health returned200/ok. Public `/api/readyz` returned401;
  the actual internal readiness and Worker status require authorized inspection.
- Six affected Compose files passed `docker compose config --quiet` with
  explicitly synthetic required values. This proves syntax, not production
  secret completeness. No production credentials were read or printed.
- Deployment/smoke contracts:22/22. The new smoke cases failed before the fix;
  the CI selector test also failed before wiring the cases into scoped CI.

The old release smoke falsely required `reasoningRuntime:null`, accepting a
retired runtime and rejecting the real public runtime contract. The fix verifies
the exact installed package's public `releaseVersions`, retains commit/product
version, tenant and authenticated WebSocket checks, and omits HTTP error bodies.
Its isolated transport fixture is a script contract test, not a live smoke pass.

## Blocking access and remaining release sequence

This cloud executor lacks Sigillo, the Komodo CLI, Komodo API/webhook environment
injection, Cloudflare environment injection and an existing authorized smoke
session. The production skill explicitly requires stopping when credentials are
missing. No credential was created, copied into a file, or extracted from CI.
No signed webhook, ResourceSync write, deployment or database mutation occurred.

1. Restore the existing authorized cloud Sigillo access; resolve the current
   `LingxiLoop Control Plane` project and `prod` environment. Check identity and
   official Komodo CLI2.3.3 through Sigillo against the fixed HTTPS entrypoint.
2. Read current txy3-backed servers, exact owned stacks, the ordered rollout,
   update history and resource-sync source. Compare the live source with the
   reviewed repository before any sync; preserve unrelated services and
   wegolibrary. Do not run two releases concurrently.
3. Read the actual production migration/runtime receipt and active task counts.
   If0027 is still pending, drain interactive, handoff, Mission and Canvas tasks
   before membership changes. For0043, stop both old workers, confirm no live
   leases and schema11 provenance, retain data/backup evidence and run the
   forward migration once. No database reset or legacy adoption is allowed.
   The existing forum preflight requires schema38 or newer; if the live schema
   is older, diagnose that boundary before invoking the rollout script.
4. After checks, use the existing GitHub Actions release path to publish and pin
   immutable images, then the reviewed `lingxiloop-production-rollout` procedure.
   Current source pins still reference earlier server/gateway images because the
   development merges intentionally skipped deployment; do not trigger the old
   procedure without preparing and verifying the new image references.
   No control-plane source changed in the164–175 development range; confirm the
   live Worker version before deciding whether Cloudflare deployment is needed.
5. Retain the Komodo update ID and require `Complete` with `success:true`.
   Verify both app/Worker image identities, package3.5.2/schema12/migration43,
   healthy affected services, public exact commit metadata, and run the repaired
   smoke using an existing authorized session and tenant. Verify message
   acceptance/IM durability, a bounded model action and the next human turn only
   in the authorized test tenant with approved provider/pricing limits.

The original3.5.1 Web/API-only soak, its evidence watcher and the single existing
independent24h review were left untouched. None qualifies3.5.2 durability.

See [admission receipt](admission.json), [public observation](public-preflight.json),
[Compose checks](compose-validation.json), [red tests](smoke-red.log),
[red CI selection](selector-red.log) and [green22-case result](contracts-green.log).

Only trailing whitespace is normalized in the retained test logs. Raw command
logs remain under `/tmp/lingxiloop-release-*` in this executor.
