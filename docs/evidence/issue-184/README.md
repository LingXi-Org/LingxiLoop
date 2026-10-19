# Issue #184 focus canvas evidence

Scope: the existing inline **自由讨论 / 正式作业** composer, its normal attachments and source references. This follows the narrowed forum scope in #121/#187; retired case publishing and independent resource aggregation are outside this change. Production services, authentication, storage, authorization, environment files and security configuration were not changed for validation.

## Recorded results

Validated on 2026-10-19 with Node.js **22.23.3**. Both browser reports contain zero failed and zero skipped tests.

| Check | Result |
| --- | --- |
| #184 official browser journeys | **3 passed**, 59.88 seconds |
| #163 avatar/draft regression | **1 passed**, 103.17 seconds |
| E2E TypeScript check | Passed |
| Web tests | **88 passed**, 0 skipped |
| Isolated forum integration | **10 passed**, 0 skipped; second migration was a no-op |
| Web lint | Passed; 2 pre-existing warnings and 2 informational findings outside this change |
| Web TypeScript and Vite build | Passed |

[`browser-validation.json`](browser-validation.json) records the browser run IDs, exact test names, timestamps, runtime, engine versions and SHA-256 hashes for all **36** retained screenshots. The broader web/build checks were run by the coordinating implementation session; the browser reports above are the owning UI evidence.

## Reproduce

Use Node.js 22, the repository's installed dependencies and official Chromium engine. Start the disposable PostgreSQL/Redis services described in [`e2e/forum/README.md`](../../../e2e/forum/README.md), then run serially:

```sh
npm run test:e2e:typecheck
node e2e/server/forum.mjs --browser-only --issue184
node e2e/server/forum.mjs --browser-only --issue163
node e2e/forum/collect-issue184-evidence.mjs
```

Each runner recreates the synthetic forum fixture in `lingxiloop_forum_test`, migrates twice and starts/stops loopback API/Vite services. Do not run these fixtures concurrently. Browser automation uses `tester-army/e2e` 0.17.0 and its official `@e2e-dev/web` 0.12.0 engine. No direct Playwright API is used.

Native reports remain in `artifacts/forum/issue184/browser` and `artifacts/forum/issue163/browser`. The collector accepts only fully passing runs with the expected test counts, verifies screenshot SHA-256 values against the reports and retains explicit screenshots plus a sanitized [`browser-validation.json`](browser-validation.json). Browser traces, storage, cookies and raw request payloads are not copied into this evidence directory.

## Screenshot matrix

| State | Light desktop | Dark desktop | Light narrow | Dark narrow |
| --- | --- | --- | --- | --- |
| Compact | [1440px](screenshots/issue184-light-1440-compact.png) | [1440px](screenshots/issue184-dark-1440-compact.png) | [390px](screenshots/issue184-light-390-compact.png) | [390px](screenshots/issue184-dark-390-compact.png) |
| Editor; materials closed | [1440px](screenshots/issue184-light-1440-editor-materials-closed.png) | [1440px](screenshots/issue184-dark-1440-editor-materials-closed.png) | [390px](screenshots/issue184-light-390-editor-materials-closed.png) | [390px](screenshots/issue184-dark-390-editor-materials-closed.png) |
| Editor; materials open | [1440px](screenshots/issue184-light-1440-editor-materials-open.png) | [1440px](screenshots/issue184-dark-1440-editor-materials-open.png) | [390px](screenshots/issue184-light-390-editor-materials-open.png) | [390px](screenshots/issue184-dark-390-editor-materials-open.png) |
| Expanded focus; long body | [1440px](screenshots/issue184-light-1440-focus-long-body.png) | [1440px](screenshots/issue184-dark-1440-focus-long-body.png) | [390px](screenshots/issue184-light-390-focus-long-body.png) | [390px](screenshots/issue184-dark-390-focus-long-body.png) |
| Focus; material menu | [1440px](screenshots/issue184-light-1440-focus-material-menu.png) | [1440px](screenshots/issue184-dark-1440-focus-material-menu.png) | [390px](screenshots/issue184-light-390-focus-material-menu.png) | [390px](screenshots/issue184-dark-390-focus-material-menu.png) |
| Collapsed; keyboard focus | [1440px](screenshots/issue184-light-1440-collapsed-keyboard.png) | [1440px](screenshots/issue184-dark-1440-collapsed-keyboard.png) | [390px](screenshots/issue184-light-390-collapsed-keyboard.png) | [390px](screenshots/issue184-dark-390-collapsed-keyboard.png) |

Workflow evidence: [pending upload](screenshots/issue184-upload-pending.png), [failed upload](screenshots/issue184-upload-failed-preserves-file.png), [body preview and materials](screenshots/issue184-body-preview-and-materials.png), [restored draft](screenshots/issue184-restored-draft.png), [failed publishing](screenshots/issue184-publish-failed-preserves-draft.png), [successful publishing](screenshots/issue184-published-draft-cleared.png), [assignment fields](screenshots/issue184-assignment-preserved-fields.png), [student discussion](screenshots/issue184-student-discussion-permission.png).

Avatar regression: [multiple accounts](screenshots/issue163-multiple-account-avatars.png), [roster refresh](screenshots/issue163-account-avatar-roster-refresh.png), [dark expanded editor](screenshots/issue163-expanded-dark-mobile.png), [dark keyboard collapse](screenshots/issue163-compact-dark-keyboard.png).

## Coverage

- Actual file/image upload, controlled pending/failure, retry preserving completed files; material totals and file/link summaries; removal and body image preview.
- Material reference links remain separate from Markdown body links. Enter adds a reference; Enter on Cancel dismisses it. Existing tags and course-source associations persist.
- Collapse/reopen/reload preserves drafts and materials; restored material trays start closed. Failed publishing preserves the draft; successful keyboard publishing persists the real API record and clears the saved draft.
- Formal assignment title, deadline, tags and source reference survive mode switches and publish correctly. Students can discuss, cannot see the assignment mode and receive HTTP 403 for direct assignment creation.
- Desktop 1440px and narrow 390px, light and dark: compact editor, ordinary editor with populated materials closed/open, long-body focus mode, material menu and keyboard collapse. Assertions check reading order, canonical palette, bounded internal scrolling, control bounds and no page overflow.
- Focus-mode material, formatting, body-link and source-selector portals remain usable; Escape closes each popup without exiting focus. Escape from the composer header exits focus.
- Existing #163 regression: real account-bound avatars, updates in posts/comments/roster, broken-avatar fallback, independent teacher/student drafts, collapse and keyboard focus.

## Limits

The browser exercises real forum, learning, upload and file HTTP routes against isolated PostgreSQL and Redis. Authentication identities are synthetic; object storage and recorded WuKong use the existing integration providers. Upload failure/pending states use explicit fixture-only gates before the real presign route. This run does not validate production login, production object delivery, live model generation, outbound notifications or deployment.

The first exploratory run found a test assertion that treated CodeMirror's empty placeholder as body content; it was corrected. Expanded popup coverage then found Escape bubbling out of a menu and leaving focus mode. The source guard was corrected and the regression retained. A worktree dependency symlink initially blocked bundled fonts; final screenshots use local dependencies without changing Vite filesystem-security settings.
