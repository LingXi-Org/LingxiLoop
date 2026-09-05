# Black-box Agent Eval

`eval/` is an independent Node 22.13+ npm package with its own lockfile. It has no product imports, PostgreSQL/Redis dependency, internal harness or runtime fallback. The production-model target calls an explicit OpenAI-compatible API. `eval/targets/agent-os.ts` contains only a type alias; no AgentOS adapter is implemented.

## Configure and run

From the repository root:

```sh
npm ci --prefix eval
npm run eval:check
cd eval
# .env.local has been created locally; on a new checkout copy .env.example.
```

Fill `eval/.env.local` with the two API keys and each model's CNY-per-million input/output prices. Defaults: Candidate `Qwen/Qwen3.5-4B`, Judge `deepseek-ai/DeepSeek-V4-Pro`, each at `https://api.siliconflow.cn/v1`. Blank credentials/prices are errors. Zero pricing is allowed only for an actually free service. Prices are configured estimates, not a provider billing statement; pricing changes alter model fingerprints. No product environment or generic `OPENAI_*` key is inherited.

```sh
npm run eval -- run --env .env.local --suite suites/black-box-smoke.v2.json --dataset datasets/smoke.v1.json --revision YOUR_COMMIT
```

The CLI prints `job=UUID`. Exit codes: 0 success, 1 evaluated but gate failed, 2 configuration/execution failure. A first healthy run still exits 1 because the suite requires a baseline. It may be **eligible** for promotion while its release gate is blocked. Review it, then create an immutable reference:

```sh
npm run eval -- baseline --job UUID --name smoke-reference-v1 --reason "Reviewed initial reference"
npm run eval -- baseline-export --name smoke-reference-v1 --file baselines/smoke-reference-v1.json
npm run eval -- run --env .env.local --suite suites/black-box-smoke.v2.json --dataset datasets/smoke.v1.json --revision YOUR_COMMIT --baseline smoke-reference-v1
```

No fabricated production baseline ships. Portable files contain dataset/manifest and scored samples: review them as potentially sensitive. SHA-256 detects modification, not authorship. Import checks coverage, grades, aggregate consistency and eligibility atomically:

```sh
npm run eval -- baseline-import --file baselines/smoke-reference-v1.json
# Or import into a fresh CI store and run:
npm run eval -- run --env .env.local --suite suites/black-box-smoke.v2.json --dataset datasets/smoke.v1.json --revision YOUR_COMMIT --baseline-file baselines/smoke-reference-v1.json
```

Import refuses an existing name; use `--baseline NAME` thereafter. Changing a reference requires a new name and explicit review reason.

## Jobs and replay

```sh
npm run eval -- enqueue --env .env.local --suite suites/black-box-smoke.v2.json --dataset datasets/smoke.v1.json --revision YOUR_COMMIT --baseline smoke-reference-v1
npm run eval -- work --env .env.local --job UUID
npm run eval -- rerun --env .env.local --job UUID
npm run eval -- cancel --job UUID
npm run eval -- report --job UUID
npm run eval -- gate --job UUID
```

Enqueue snapshots validated data, suite, target/Judge fingerprints, engine version, seed, revision and baseline name. Reusing a dataset/suite id and version with changed content is rejected. Work claims one renewable job lease; competing workers cannot execute it. Cases use bounded concurrency, samples within a case run serially. Every sample is checkpointed. SQLite WAL, full synchronous commits, foreign keys and transactional fencing protect persistence. This backend supports processes on one host/local filesystem, not network filesystems or distributed clusters.

After a crash, an expired lease may be reclaimed. Completed samples are retained. An in-flight sample becomes `interrupted_usage_unknown`, without automatically repeating paid requests. Rerun explicitly creates a new job with the original manifest; changed target/Judge configuration is rejected. To compare a changed Candidate, create a new run. Temperature/seed are pinned where supported, but external models and provider aliases remain stochastic: reproducibility means pinned conditions and preserved results, not identical generated text.

SIGINT/SIGTERM abort work; cancel permanently cancels a queued/running job. Unknown usage, incomplete jobs and interrupted/cancelled work cannot pass. No hidden provider retries or fallback models exist. Budgets are release thresholds, not hard prepaid spending limits; in-flight calls may incur charges even if their result is unavailable.

## Scoring and release

Deterministic graders cover exact strings, substrings and structural JSON equality. Semantic grading uses [Autoevals Factuality](https://github.com/braintrustdata/autoevals#custom-client-configuration) with an explicit per-call Judge client. Invalid/missing scores and transport errors fail closed. Autoevals is pinned to 0.3.0; no global client, ambient Braintrust wrapper or product ledger is used.

Sample scores average graders; case scores average samples; run scores average cases. Case pass requires every sample and grader to pass. Errors score zero. Reports contain per-grader aggregates, failure categories, samples, separate Candidate/Judge tokens and estimated costs, and sample p95 latency including grading. Baseline comparison requires identical engine, full suite/dataset, Judge fingerprint and seed; Candidate changes are the evaluated variable. Aggregate and per-case regression thresholds are separate. Errors, missing usage, minimum score/pass-rate failures, latency/cost breaches, absent required baseline and incompatible baseline block release.

### CI live evaluation and visual reports

`.github/workflows/black-box-eval.yml` uses repository secrets `EVAL_CANDIDATE_API_KEY` and `EVAL_JUDGE_API_KEY`. Each role's BASE_URL, MODEL, INPUT_CNY_PER_MILLION, OUTPUT_CNY_PER_MILLION, MAX_TOKENS and TIMEOUT_MS are repository variables with the same `EVAL_*` names as `.env.local`. No key is written to the checkout or reports. Updating the local file does not automatically update GitHub; synchronize changed configuration explicitly.

Paid evaluation is opt-in: add the `run-live-eval` label to a PR from this same repository, use workflow_dispatch after the workflow is on the default branch, or invoke it as a reusable workflow. Fork PRs are excluded, and push/synchronize events do not repeat paid calls. Remove and re-add the label only to explicitly request another run. Runs for the same ref are serialized without cancelling an already paid request.

CI uses `ci-smoke.v1`: one case, one sample, one Candidate call and at most one Autoevals Judge call. There are no provider retries. Autoevals uses `useCoT: false` to omit the requested explanation; this setting is part of the Judge fingerprint, so older baselines need explicit renewal. Provider-internal reasoning may still count toward the configured output-token limit. The full local smoke suite remains available but is not run by this paid workflow.

The optional workflow input `baseline_file` or repository variable `EVAL_BASELINE_FILE` selects a reviewed reference. With neither set, evaluation still produces reports but the release gate fails with `baseline_required`; a reference is never promoted automatically. The smoke score is not comprehensive AgentOS quality evidence.

Actions Job Summary shows scores, gate reasons and the artifact download link. The artifact includes a standalone HTML dashboard (scores, case/grade meters, model/Judge accounting and trace records), JSON, Markdown and JSONL spans, retained for 30 days. Download/unzip and open the HTML locally; it uses no JavaScript, external assets or server. Summary and upload run even when the evaluation gate fails. Configuration failures with no report produce an explicit blocked summary. SQLite and raw datasets are not uploaded.

Cost estimates use the supplied prices, and a configured zero price means a zero estimate, not a verified free API. The CI suite's CNY 0.15 Judge threshold is a post-run release check, not a provider spending cap. A publishing workflow consuming this workflow must depend on its success. Ordinary CI runs offline infrastructure tests, without paid calls.

## Target and telemetry boundaries

Implement `EvalTarget.identity` and `execute({input, requestId, seed, signal})`, returning `{output, usage?}`. Fingerprint all behavior-affecting adapter configuration without secrets. Respect cancellation, bound output and report usage when known. Expected answers never reach the target. No private runtime events, prompt/context objects, kernel, product model client or control-plane state crosses the contract. A custom launcher passes the adapter to `runJob`; Eval Core needs no change. The current CLI selects only the Candidate API target.

`TelemetryBackend` accepts versioned spans and flush. `runJob` optionally fans out to a backend while persisting local telemetry. Trace/span IDs, parent relationships, Unix-nanosecond timestamps, status and primitive attributes map to OpenTelemetry/OTLP. Run → case → sample contains grader spans; Candidate and Judge calls have separate trace IDs and role attributes, linked to the sample through OpenTelemetry links. Latency, tokens, costs and failure metrics remain separated by role. This is a backend contract, not an OTLP HTTP exporter. A future visualization/exporter consumes it without AgentOS introspection; export failures fail execution.

Artifacts under `eval/.state/reports/` include aggregate/sample JSON, Markdown and JSONL spans. They store output hashes, synthetic IDs and bounded failure codes, never prompts, answers, keys or provider error bodies. Private SQLite under `eval/.state/` retains dataset inputs for replay: protect it with host ACLs, back it up as sensitive data and never upload it publicly. `--db` and `--out` select storage. The static HTML report is included; no separate visualization service is required.

## Legacy retirement

Old scripts, suites/baselines, server Eval modules, internal runtime adapters/tests and Trust Eval endpoints are removed. Product learning evaluation remains separate and unchanged. Main's applied `0001_v1_baseline.sql` is preserved byte-for-byte. New migration `0006_retire_legacy_eval.sql` retires the three old Eval tables without CASCADE.

Stop old Eval readers/writers and archive required historical Eval results before deployment. Run `npm run db:migrate` before starting the new processes. Old binaries are incompatible with the removed tables; rollback requires the operations backup. Existing signed Trust snapshots remain immutable historical records; new snapshots omit old Eval fields. No production database is modified by this merge.

Accounting uses CNY (人民币), including prices per million tokens, `costCny`, gate budgets and `eval.cost.cny` spans. Values are used directly without exchange-rate conversion. The v2 engine, suite/manifest/report/baseline schemas reject former USD artifacts; create fresh runs and reviewed baselines instead of relabeling historical costs. The smoke suite is version 2; dataset content is unchanged.
