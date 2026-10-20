# PR240 exact-source independent review and blocked browser acceptance

PR240 source7769b041dc75f9968aeba911758966e87035dd0c, branch codex/214-218-219-minimal-browser. Root reviewed all9changed test/config/doc files in an independent checkout using the existing formal dependency tree, without installation or lock changes. Official e2e0.17.0/@e2e-dev/web0.12.0 are used. Full owning command `node node_modules/typescript/bin/tsc -p e2e/tsconfig.json` passed. An initial wrong tsconfig.e2e.json path returnedTS5058; that command error is preserved and is not a product defect.

Official list commands selected exactly6run dispositions:214one native reduced-motion test,218two390/1440expanded-card tests,219twoeditor-menu tests andoneforum-state navigation test. **Actual browser tests executed0/6; passed0, failed0, not-run6.** List does not launch a browser and is not passing test evidence.

At2026-10-20T16:10:12UTC the existing Chromium1243binary was launched once with a new local temporary profile, headless, native force-prefers-reduced-motion, loopback CDP53129 and about:blank. It exited134 with `No usable sandbox`; stderr is retained. Crashpad additionally could not write its default settings on the readonly filesystem. No application or test assertions started. The path was stopped immediately; no --no-sandbox, user namespace/AppArmor change, privilege escalation, sandboxless managed-browser fallback or TLS bypass was used. No local DB runner was started merely to fail on the known browser prerequisite.

Exact bootstrap command (profile path assigned with mktemp; variable is not a credential):

```sh
HANDOFF_CHROME_PROFILE=$(mktemp -d /tmp/lingxi-native-media-root.XXXXXX)
/workspace/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome --headless --force-prefers-reduced-motion --remote-debugging-address=127.0.0.1 --remote-debugging-port=53129 --user-data-dir="$HANDOFF_CHROME_PROFILE" about:blank
```

No new product defect is established by this environment failure. Static review confirms native JS+CSS media probes (no matchMedia stub in the new native case), actual ToolCall expansion/visible-details assertions, public CDP config passthrough, runner environment passthrough and separate artifact output. These assertions have not been exercised here. #214/#218 official-live visual comparison retains its previous ERR_CERT_AUTHORITY_INVALID limit; no current TLS recovery was established and the official site was not retried.

Minimal next step: an already authorized test browser with a working sandbox and native reduced-motion setting, reachable through E2E_CDP_URL. Run only the6commands/cases in [PR240 exact README](https://github.com/LingXi-Org/LingxiLoop/blob/7769b041dc75f9968aeba911758966e87035dd0c/docs/evidence/remaining-ui-browser-214-218-219/README.md). #218 uses no native-motion prerequisite but still needs a working sandboxed browser; pass E2E_CDP_URL to its existing root config too when reusing that browser. #219's oneforum case requires only its existing isolated local PostgreSQL/Redis fixture, not production credentials or a new user identity. Official-live comparison separately needs normal TLS trust. Do not expand to full browser/model suites.

PR240 remains a test/config delivery, not evidence that214/218/219passed these missing basic checks. #217 remains assigned to the separate quality author; clipboard denial must not be bypassed and physical touch remains outside this run.
