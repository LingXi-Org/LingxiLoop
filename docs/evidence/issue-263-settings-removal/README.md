# #263: deleted conversations in settings

Baseline: fetched `origin/main` at `c66e847d14f838e72d0ab19e252e6cd4e2b68a76` on 2026-10-21. PR251 and product migration0049 are already present. The main branch's latest delivery receipt records product50 / published runtime3.6.0 / native14.

The removed-conversation dialog was owned and mounted by `ConversationsPane`, leaving account data recovery in the active conversation area. The list now lives directly inside the existing **设置 → 数据与账号** panel using `SettingsGroup`. Desktop sidebar and mobile tabs retain their layout; the data tab consistently uses its existing database icon and section name. Deletion confirmation and success text point to settings.

The original removed-list API, restore action, and user/company/project key remain in use. Closing settings or changing sections/scopes aborts reads and fences pending view updates and restore notifications. Failed restores retain their row; load errors can retry; pending restore buttons are disabled. No server, migration, permission, shared-history, membership, stream, or visualize source changed. No hard-delete action or production data operation was added or executed.

## Validation

- Web typecheck, lint, and build passed. Lint retains 5 existing warnings / 3 infos; build retains existing CSS/chunk warnings.
- Existing settings and personal removal regressions passed **5/5**. These include denied removal, stale list responses, selection cleanup, scope fencing, and restore reload.
- Official `@e2e-dev/web` Chromium component regressions passed **3/3**, with real settings/layout/UI and fixture-only API/store boundaries: desktop restore success/failure, load error/retry, closing pending loads, scope changes, mobile navigation/viewport/focus, and closing a pending restore.
- E2E TypeScript check and `git diff --check` passed.
- Dependency installation used the unchanged lockfile and `npm ci --ignore-scripts --cache /tmp/lingxi-settings-npm-cache`; installed public runtime is 3.6.0. No dependency edits.

The browser suite is component coverage, not live backend or production acceptance. Existing PR251 server authorization and data semantics are unchanged. Independent integration review and release CI remain with the sole integrator; this branch does not merge or deploy.

## Reproduce

```sh
node --import tsx --experimental-test-module-mocks --test --test-force-exit src/features/settings/settingsDialog.test.ts src/features/conversations/removal.test.ts
npm run typecheck
npm run lint
npm run build
npm run test:e2e:typecheck
```

For component browser coverage, start the fixture server in a separate terminal:

```sh
node node_modules/vite/bin/vite.js --config e2e/settings-removal/vite.config.ts
```

Then run with the official engine's managed Chromium, or set `E2E_CDP_URL` to an installed Chromium debugging endpoint:

```sh
E2E_TELEMETRY_DISABLED=1 node node_modules/.bin/e2e run --config e2e/settings-removal/config.ts
```

`browser-report.json`, check transcripts, and four screenshots in this directory retain the actual results. The fixture writes only local disposable state and never accesses a real account or production API.
