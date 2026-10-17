# Issue #163 validation

Base: `2db5bbcddc8f14ac62500e36594dc49793c9e096` (`main`). Branch: `codex/issue-163-compact-forum`.

The inline forum composer starts as a single text row. Focusing it exposes the existing Markdown toolbar, attachments, metadata, publishing and teacher assignment controls. Collapsing keeps the editor and upload state mounted. Text and preview scroll within a bounded height. Existing account/course/type draft keys and automatic persistence remain in use; publishing failure retains the draft and attachments.

Forum posts, comments, submission versions and learner rows return their corresponding `users.avatar_url` through their existing authorized queries. The shared forum identity component uses the existing UI Avatar primitive, the authenticated user's current profile, and the shared human participant refresh. It falls back to the authorized response for historical authors absent from the current roster. Missing and broken avatars display a labelled initial placeholder. No image is invented when an account has no avatar.

No migration, dependency manifest/lock change, production data write, deployment or merge is part of this change. API additions are nullable avatar response fields on existing forum/homework queries; paths and authorization are unchanged.

## Reproduce

Use the cloud environment's Node `22.23.3` and cached official browser:

```sh
export PATH=/workspace/.tools/node-v22.23.3-linux-x64/bin:$PATH
export XDG_CACHE_HOME=/workspace/.lingxi-setup/cache
export NODE_EXTRA_CA_CERTS="$SSL_CERT_FILE"
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci --cache /tmp/lingxi163-npm-cache --prefer-offline --no-audit --no-fund
docker compose -f e2e/server/compose.yaml up -d --wait
npm run lint
npm run server:lint
npm run typecheck
npm run server:typecheck
npm run test:e2e:typecheck
npm test
npm run server:test
npm run build
node e2e/server/forum.mjs --browser --issue163
node e2e/server/run.mjs --file homework.test.ts
node e2e/server/forum.mjs --browser-only
git diff --check
```

The frozen install resolves LingxiOS `3.4.7` exactly as committed. Preinstalled `3.3.8` initially produced a `mention_limit` type error even on the base checkout; that error disappeared after `npm ci`. The cloud setup already skips the unrelated Electron binary download, which otherwise fails to connect to GitHub here. TLS validation remains enabled.

## Results and evidence

- Web and Server lint, Web/Server/E2E typechecks, Web build and diff whitespace check: passed. Web lint retains two existing warnings and two informational findings in unrelated files; build retains the existing CSS/chunk-size warnings.
- Web tests: **87 passed, 0 failed, 0 skipped**. Server tests: **102 passed, 0 failed, 0 skipped**.
- Forum integration: **10 passed, 0 failed, 0 skipped**. Native homework integration: **37 passed, 0 failed, 0 skipped**.
- Focused official `e2e 0.17.0` / `@e2e-dev/web 0.12.0` browser journey: **1 passed, 0 failed, 0 skipped**. [Native report](../artifacts/forum/verified/issue163/report.json), [summary](../artifacts/forum/verified/issue163/summary.md), [driver log](../artifacts/forum/verified/issue163/forum-driver.log), [integration results](../artifacts/forum/verified/issue163/forum-results.json).
- Full existing forum browser regression (including #163): **7 passed in 6 files, 0 failed, 0 skipped**. [Native report](../artifacts/forum/verified/issue163/regression-report.json), [summary](../artifacts/forum/verified/issue163/regression-summary.md), [driver log](../artifacts/forum/verified/issue163/regression-driver.log).

The initial composer measures **60px** at both `1440 × 844` and `390 × 844`; the first content card starts at **419px** and **370px** respectively. The text remains **16px**, with no horizontal page overflow. The journey checks long-text internal scrolling, keyboard expansion/collapse and visible focus, preview-to-edit recovery, attachments across collapse/reload/type switching, teacher assignment publication, a real HTTP 503 and retry, account switches, post/comment avatar identity, avatar changes after reload, failed image fallback and the existing 60-second roster refresh without a page reload.

All retained screenshots and logs are under [artifacts/forum/verified/issue163](../artifacts/forum/verified/issue163):

| Evidence | Screenshot |
| --- | --- |
| Compact desktop | [001](../artifacts/forum/verified/issue163/001-issue163-compact-light-1440.png) |
| Compact narrow screen | [002](../artifacts/forum/verified/issue163/002-issue163-compact-light-390.png) |
| Expanded long text and attachment | [003](../artifacts/forum/verified/issue163/003-issue163-expanded-long-text-and-attachment.png) |
| Multiple account avatars | [004](../artifacts/forum/verified/issue163/004-issue163-multiple-account-avatars.png) |
| Post and comment identity | [005](../artifacts/forum/verified/issue163/005-issue163-post-and-comment-avatars.png) |
| Updated avatar | [006](../artifacts/forum/verified/issue163/006-issue163-updated-account-avatar.png) |
| Failed image placeholder | [007](../artifacts/forum/verified/issue163/007-issue163-failed-avatar-placeholder.png) |
| Other account updated by roster refresh | [008](../artifacts/forum/verified/issue163/008-issue163-account-avatar-roster-refresh.png) |
| Expanded dark narrow screen | [009](../artifacts/forum/verified/issue163/009-issue163-expanded-dark-mobile.png) |
| Compact dark keyboard focus | [010](../artifacts/forum/verified/issue163/010-issue163-compact-dark-keyboard.png) |

The local fixture uses disposable synthetic teacher/student/peer accounts and PostgreSQL, the real forum/profile/upload HTTP routes, recorded WuKong messages and in-memory object storage. Avatars are explicitly labelled `TEST` graphics uploaded and saved through the actual profile API, then compared with the account's saved URLs. These screenshots prove saved account-data binding, not production user identity or external storage delivery. Live production accounts, gateway login, external object storage and live model generation remain outside this isolated validation. No production acceptance or deployment is claimed; Astra owns integration review.
