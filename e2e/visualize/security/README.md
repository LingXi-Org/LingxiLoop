# Visualize navigation fixture

This archives the existing five-case official E2E fixture used for issue 193. It uses hard-coded dummy data and local servers on localhost:53193 and 127.0.0.1:53194. There are no product credentials. It loads the current product `buildWebShell` and CSP declarations relative to this directory; use the reviewed issue-193 revision when reproducing the historical result.

Run from the repository root using the installed official browser engine and its configured browser cache:

```sh
E2E_TELEMETRY_DISABLED=1 node node_modules/e2e/dist/cli/bin.js run --config e2e/visualize/security/e2e.config.ts
```

If the environment stores browsers outside the engine's default cache, set `PLAYWRIGHT_BROWSERS_PATH` to that existing cache. This is an engine cache setting; the fixture does not import or invoke Playwright directly.

Results and `evidence.json` go to `.e2e/visualize-security/`. The historical 5/5 passing report and screenshots are in `docs/evidence/issue-193/security/`; those reports were produced by the original temporary-path fixture, before this path-only archival edit. **This archived version has not been rerun.** No test scenario or expected result was added or changed.

The baseline expects exactly one navigation collector request containing guest dummy state. The four constrained cases each expect zero requests for that case. Every case checks denial of parent DOM, parent dummy token, cookie and localStorage access. The hits array is cumulative; assertions filter it by mode. This fixture is limited to navigation containment and does not establish full product bridge, gesture, clipboard or authenticated API acceptance.
