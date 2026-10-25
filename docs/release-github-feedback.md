# GitHub feedback from the durable release ledger

With `RELEASE_CONTROLLER_ENABLED=true`, the scoped CI workflow registers its
qualified immutable candidate and then runs the deterministic `report-release`
job. The job uses only the existing API-only `RELEASE_API_TOKEN` to read the
release record and resumable event cursor. It never executes a production
operation or calls a model. Normal waiting is a Node event timer, not an Agent
polling loop.

The observer uses GitHub Actions' existing ephemeral `GITHUB_TOKEN`. Only this
job receives `deployments: write` and `statuses: write`; no long-lived GitHub
personal access token is added to Sigillo or the release Worker. The job has no
release administrator or Cloudflare token. All upstream checks/integration and
exact-source registration gates remain unchanged. Its source SHA/release ID
outputs are emitted only from a matching qualified manifest and the actual
controller submission receipt.

A GitHub deployment is reporting metadata for the exact source SHA, with
`auto_merge: false`, task `lingxiloop-release` and payload `releaseId`. It does
not cause this code to deploy. Deployment creation does not wait on GitHub
status contexts (`required_contexts: []`) because the exact-source check jobs
already succeeded before registration and this observer's own release status
is intentionally pending until acceptance. This does not weaken or replace
those owning check gates. Existing deployments for the same release are
reused; a lost creation response is reconciled by lookup before any possible
retry. Updating a status never automatically inactivates other deployments.

| Controller observation | Deployment status | `release/controller` commit status |
| --- | --- | --- |
| `accepted` | `success` | `success` |
| `failed`, `recovered`, `blocked` | `failure` | `failure` |
| `superseded` | `inactive` | `pending` with superseded description |
| Queued/preparing/waiting | `pending` | `pending` |
| Active/recovering | `in_progress` | `pending` |
| Timeout or unverified observation | `pending` | `pending` with unknown description |

Recovery is not acceptance of the failed candidate. A superseded candidate is
not reported as successful just because a newer one may be running. Only the
exact matching release/SHA can cause success. A release API outage, bad
identity, missing permission or observation timeout does not prove production
failed. The JSON receipt and job summary distinguish those unknown outcomes.
Terminal controller failures fail the observer job; superseded and timed-out
observers finish with their explicit inactive/pending release status. A
successful observer process exit therefore never substitutes for the external
`release/controller` status or accepted ledger receipt.

The program waits at most 40 minutes and the GitHub job is bounded to 45
minutes, including setup/API reporting overhead. It polls bounded release/event
GETs every ten seconds, with request deadlines and no side-effect request
retries. Auth/identity errors stop observation immediately. A later rerun can
reuse the same GitHub deployment and reconcile the current ledger state. No
production runtime or recovery timing claim is inferred from these tests.

Enabled build workflows use the exact source SHA as their Actions concurrency
group, so different source candidates can build concurrently and reach the
controller's batching queue. They do not cancel an older workflow that may be
executing production changes. When disabled, concurrency retains its prior
per-ref group and main is never canceled. Actions concurrency does not grant
execution ownership: the durable controller and host journals still arbitrate
all conflicting production writes.

`release-github-report.json` contains only release/SHA, GitHub deployment ID,
observed controller status/phase, outcome, elapsed time and bounded error code.
Credentials stay in environment bindings and headers; redirects are rejected,
and raw API responses or bearer values are not logged. No GitHub API call or
production state change was performed while implementing this module.

The implementation follows GitHub's [deployment status
contract](https://docs.github.com/en/rest/deployments/statuses) and [commit
status contract](https://docs.github.com/en/rest/commits/statuses).
