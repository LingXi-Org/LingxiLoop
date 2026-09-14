# Black-box Agent Eval

`eval/` is an independent Node 22.13+ npm package with its own lockfile. It has no product imports, PostgreSQL/Redis dependency, or runtime fallback. The production-model target calls an explicit OpenAI-compatible API. `eval/targets/agent-os.ts` is retained only as a generic target type alias and is not connected to LingxiOS.

## Configure and run

From the repository root:

```sh
npm ci --prefix eval
npm run eval:check
cd eval
# .env.local has been created locally; on a new checkout copy .env.example.
```

Fill `eval/.env.local` with the two API keys and each model's CNY-per-million input/output prices. The example uses Candidate `deepseek-ai/DeepSeek-V4-Flash` and Judge `Pro/moonshotai/Kimi-K2.6` at `https://api.siliconflow.cn/v1`. The two model configurations remain explicit and independently priced. To use the same provider key, explicitly populate both key fields; there is no credential fallback. Blank credentials/prices are errors. Zero pricing is allowed only for an actually free service. Prices are configured estimates, not a provider billing statement; pricing changes alter model fingerprints. No product environment or generic `OPENAI_*` key is inherited.

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

Sample scores average required graders; diagnostic efficiency does not affect scores or pass/fail. Case scores average samples; run scores average cases. Case pass requires every sample and required grader to pass. Errors score zero. Reports contain per-grader aggregates, failure categories, samples, separate Candidate/Judge tokens and estimated costs, and sample p95 latency including grading. Baseline comparison requires identical engine, full suite/dataset, Judge/environment fingerprints and seed; Candidate changes are the evaluated variable. Aggregate and per-case regression thresholds are separate. Errors, missing usage, minimum score/pass-rate failures, latency/cost breaches, absent required baseline and incompatible baseline block release.

## Adversarial tool evaluation

The current semantic suites use Eval-owned snapshots of public tool contracts, including learning, teacher, questionnaire, memory, handoff and Canvas capabilities. No product modules or services execute. The Candidate uses real API calls against a synthetic scenario; this is not LingxiOS integration coverage.

| Suite / version | Cases | Coverage | Candidate / Judge run budgets (CNY) |
|---|---:|---|---:|
| tool-initiative / 2 | 6 | Act on vague document, memory, research, ingestion, calendar and email requests | 1.20 / 0.60 |
| tool-boundaries / 2 | 4 | Text-only tasks, consequential ambiguity, prompt injection and denied reads | 0.80 / 0.40 |
| tool-recovery / 2 | 2 | Concurrent title changes and historical decisions | 0.40 / 0.20 |
| education-autonomy / 3 | 16 | Teacher drafts and approvals, student state cards and personalized Missions, evidence/self-report records, deduplication, specialist handoffs, collaborative Canvas, simple answers, hypothetical/third-party records | 4.80 / 1.60 |

Select the relevant suite; running every suite is not required. Each case has one sample and at most one independent Autoevals TaskSuccess Judge call. Cases run serially, bounded by 8 Candidate calls and 10 tool calls for general suites, or 16 of each for education so multi-activity drafts and their approvals can finish. Both use at most 1536 requested output tokens per call. Candidate sample allowances are CNY 0.20 for general suites and CNY 0.30 for education; the latter leaves room for conservative request-byte reservations when a plan has multiple activities. The configured model token ceiling can be lower. The offline command `npm run eval:check` uses only local HTTP fixtures and makes no paid calls.

From `eval/`:

```sh
npm run eval -- run --env .env.local --suite suites/education-autonomy.v3.json --dataset datasets/education-autonomy.v3.json --revision YOUR_COMMIT
npm run eval -- run --env .env.local --suite suites/tool-initiative.v2.json --dataset datasets/tool-initiative.v2.json --revision YOUR_COMMIT
```

These commands are alternatives. The earlier v1 tool suites and their datasets remain immutable and available locally with deterministic grading and zero Judge calls. New versions remove brittle final-answer fragments and wording constraints on authored documents; post-write verification reads return actual authored content and ingestion rechecks reflect the queued state. Single-use mutations prevent duplicate side effects. Read ordering is required only where it supplies IDs, current facts or concurrency prerequisites.

The common assistant instruction and synthetic role/context define available authority, not the desired tool sequence. The Candidate never receives expected answers, fixture IDs, matching rules or grading thresholds. Required actions test real receipts; saying “saved” or “I can help” is insufficient. Alternative paths are expressed as OR groups. `initiative` and `restraint` remain required across every case, regardless of aggregate score: pure dialogue in action-required cases, forbidden tools and unmatched scope fail release. `efficiency` remains visible as a diagnostic, so useful verification does not fail correct work. Hard execution and spending limits still block release.

TaskSuccess checks the final answer together with transient tool arguments and results. Equivalent titles, wording, step counts and reasonable plans pass. Pending teacher approval, a delivered question card, a queued Mission coordinator or an active specialist task can correctly finish the current turn; the Judge must not require an unavailable human/child response. It checks content quality as well as a receipt, and rejects invented facts, premature claims of publication/completion and self-report presented as verified mastery. Scores are PASS=1, PARTIAL=0.5, other failures=0; the semantic threshold is 0.8. Suites require overall score 0.85 and case pass rate 0.80, with zero required-action/scope failures. These thresholds are authored before live evaluation, not adjusted to fit a run.

Teacher planning follows the current product: draft an activity, then call its publish action to request approval; pending approval leaves the activity DRAFT. Student Mission creation queues its coordinator; a separate coordinator case checks persisted actionable steps and finished planning. Public child-task deferrals suspend the current turn immediately, matching the tool contract; a subsequent child wake is a separate scenario. Canvas queries retain the started workspace instead of returning the pre-start empty snapshot. Education v1 remains the immutable record of the first run; v2 corrects those execution fixtures. Education v3 permits up to four distinct activities for the two-session differentiated plan, requires approval for every saved activity, and reflects actual drafted content in subsequent teacher reads. Duplicate content still fails semantic quality checks. Learning work uses committed evidence for formal attempts, learner-scoped memory for self-report, and no invented records for hypothetical or third-party statements. Canvas is a collaborative workspace, so complex projects require actual assignments; simple concept questions should use text.

HTML/JSON/Markdown/JSONL exports show case/tag scores, action receipts, missing actions, bounded failure codes, model/Judge calls, costs and diagnostic efficiency. Arguments, results, prompts and answers are never persisted in samples or telemetry. Judge observations exist only in memory and are sent to the explicitly configured Judge provider. Private local SQLite still retains synthetic dataset inputs for replay; do not publish it.

Candidate calls reserve a conservative byte-based input estimate plus the requested output ceiling before dispatch. Incomplete tool executions skip the paid semantic Judge and receive a deterministic failure. Judge calls similarly check the remaining Judge run allowance; unknown usage or errors stop subsequent paid work. Optional `EVAL_CANDIDATE_ENABLE_THINKING` / `EVAL_JUDGE_ENABLE_THINKING` sends the provider's `enable_thinking` field only when explicitly configured, and changes fingerprints. For SiliconFlow, the example requests non-thinking Judge mode; actual reasoning usage remains provider-dependent and can exceed the requested answer-token ceiling. Omit the field with providers that do not support it. Consult [SiliconFlow parameters](https://docs.siliconflow.cn/docs/api/chat-completions-post) and [current pricing](https://siliconflow.cn/pricing). Provider billing, cached-input discounts and unknown/in-flight reasoning usage may differ from estimates; these limits are not a prepaid cap.

Dataset/suite versions and sandbox/Judge fingerprints pin evaluation conditions. Modified conditions require a fresh baseline, reviewed and explicitly promoted; no baseline is fabricated or auto-promoted. Reports remain blocked by `baseline_required` until a compatible reference exists.

## CI live evaluation and visual reports

`.github/workflows/black-box-eval.yml` uses repository secrets `EVAL_CANDIDATE_API_KEY` and `EVAL_JUDGE_API_KEY`. Candidate BASE_URL, MODEL, INPUT_CNY_PER_MILLION, OUTPUT_CNY_PER_MILLION, MAX_TOKENS and TIMEOUT_MS are repository variables with the same `EVAL_*` names as `.env.local`. CI pins Judge to SiliconFlow `Pro/moonshotai/Kimi-K2.6`, input/output CNY 6.5/27 per million tokens, 512 requested answer tokens, 180-second timeout and `enable_thinking=false`; repository variables cannot override the Judge. Prices follow [SiliconFlow pricing](https://siliconflow.cn/pricing) and should be reviewed when rates change. No key is written to the checkout or reports. Updating the local file does not automatically update GitHub; synchronize changed configuration explicitly.

Paid evaluation is opt-in: add the `run-live-eval` label to a PR from this same repository, use workflow_dispatch after the workflow is on the default branch, or invoke it as a reusable workflow. Fork PRs are excluded, and push/synchronize events do not repeat paid calls. Remove and re-add the label only to explicitly request another run. Runs for the same ref are serialized without cancelling an already paid request.

PR-label CI uses `ci-smoke.v1`: one case, one sample, one Candidate call and at most one Autoevals Judge call. There are no provider retries. Autoevals uses `useCoT: false` to omit the requested explanation; this setting is part of the Judge fingerprint, so older baselines need explicit renewal. Provider-internal reasoning may still count toward the configured output-token limit. The full local smoke suite remains available but is not run by this paid workflow.

Manual/reusable workflow runs can select one `evaluation_suite`: `ci-smoke`, `tool-initiative`, `tool-boundaries`, `tool-recovery`, or `education-autonomy`. Manual runs default to `education-autonomy`; reusable calls default to `ci-smoke`. General tool choices select v2; education selects v3. The 90-minute job timeout accommodates serial education cases; per-call and suite spending limits still apply. All selections use the same visual artifact upload and summary. The PR label still runs only `ci-smoke`; adding these datasets does not increase automatic paid coverage. Every selected semantic suite requires explicit Judge configuration. Judge credentials remain optional in the reusable workflow schema so missing configuration produces a clear execution error.

The optional workflow input `baseline_file` or repository variable `EVAL_BASELINE_FILE` selects a reviewed reference. With neither set, evaluation still produces reports but the release gate fails with `baseline_required`; a reference is never promoted automatically. The smoke score is not comprehensive product-agent quality evidence.

Actions Job Summary shows scores, gate reasons and the artifact download link. The artifact includes a standalone HTML dashboard (scores, case/grade meters, model/Judge accounting and trace records), JSON, Markdown and JSONL spans, retained for 30 days. Download/unzip and open the HTML locally; it uses no JavaScript, external assets or server. Summary and upload run even when the evaluation gate fails. Configuration failures with no report produce an explicit blocked summary. SQLite and raw datasets are not uploaded.

Cost estimates use the supplied prices, and a configured zero price means a zero estimate, not a verified free API. The CI suite's CNY 0.15 Judge threshold is a post-run release check, not a provider spending cap. A publishing workflow consuming this workflow must depend on its success. Ordinary CI runs offline infrastructure tests, without paid calls.

## Target and telemetry boundaries

Implement `EvalTarget.identity` and `execute({input, requestId, seed, signal, scenario?, toolBudget?})`, returning `{output, usage?, tools?, evidence?}`. Semantic tool suites require bounded transient `evidence` with actual tool arguments/results; this must never be copied into persisted samples. Fingerprint all behavior-affecting adapter configuration without secrets; an optional `identity.environment` pins tool-environment conditions independently of the Candidate. Respect cancellation, bound output and report usage when known. Expected answers never reach the target. No private runtime events, prompt/context objects, kernel, product model client or control-plane state crosses the contract. A custom launcher passes the adapter to `runJob`; Eval Core needs no change. The CLI selects the Candidate API text target or tool sandbox according to the suite. Tool fixtures belong to the target and never enter the model request until a matching tool is called; `tools` contains only bounded execution metadata.

`TelemetryBackend` accepts versioned spans and flush. `runJob` optionally fans out to a backend while persisting local telemetry. Trace/span IDs, parent relationships, Unix-nanosecond timestamps, status and primitive attributes map to OpenTelemetry/OTLP. Run → case → sample contains grader spans; Candidate and Judge calls have separate trace IDs and role attributes, linked to the sample through OpenTelemetry links. Latency, tokens, costs and failure metrics remain separated by role. This is a backend contract, not an OTLP HTTP exporter. A future visualization/exporter consumes it without runtime introspection; export failures fail execution.

Artifacts under `eval/.state/reports/` include aggregate/sample JSON, Markdown and JSONL spans. They store output hashes, synthetic IDs and bounded failure codes, never prompts, answers, keys or provider error bodies. Private SQLite under `eval/.state/` retains dataset inputs for replay: protect it with host ACLs, back it up as sensitive data and never upload it publicly. `--db` and `--out` select storage. The static HTML report is included; no separate visualization service is required.

For a native runtime target, `createLingxiOSTarget` in `eval/targets/agent-os.ts` calls the public `@lyyzka/lingxios/eval` `executeRequest` entry. A custom launcher passes an isolated app and Worker, trusted request identity, a fingerprint of the model/harness/fixture configuration, and an explicit CNY-per-USD conversion, then passes the resulting `EvalTarget` to `runJob`. Each sample receives a fresh run/session identity; principal and thread are retained. Cancellation reaches the native run. Pending or estimated native usage fails the sample, as does incomplete execution. USD native usage snapshots are explicitly converted to Eval's CNY units; they are estimates of provider cost, not invoices.

The native target does not execute the legacy tool-sandbox scenarios. Keep their versioned datasets unchanged; use native fixtures in the custom launcher. `scripts/test-native-agent-eval.mjs` exercises the native target with an isolated database and a controlled model. It verifies infrastructure and identity handling, not Candidate semantic quality or a release baseline. Package installation requires the same protected `NODE_AUTH_TOKEN` as the application.

## Legacy retirement

Old scripts, suites/baselines, server Eval modules, internal runtime adapters/tests and Trust Eval endpoints are removed. Product learning evaluation remains separate and unchanged. Main's applied `0001_v1_baseline.sql` is preserved byte-for-byte. New migration `0006_retire_legacy_eval.sql` retires the three old Eval tables without CASCADE.

Stop old Eval readers/writers and archive required historical Eval results before deployment. Run `npm run db:migrate` before starting the new processes. Old binaries are incompatible with the removed tables; rollback requires the operations backup. Existing signed Trust snapshots remain immutable historical records; new snapshots omit old Eval fields. No production database is modified by this merge.

Accounting uses CNY (人民币), including prices per million tokens, `costCny`, gate budgets and `eval.cost.cny` spans. Values are used directly without exchange-rate conversion. The v2 engine, suite/manifest/report/baseline schemas reject former USD artifacts; create fresh runs and reviewed baselines instead of relabeling historical costs. The smoke suite is version 2; dataset content is unchanged.
