# Standalone Agent page retirement

Refs #483. The Agent page was reachable through both the workspace rail and
`?view=agents`. Removing only its button would leave a supported URL and renderer.

The page, its rail item/render branch, view type/registry and learning-dashboard
exception are removed. Only `AgentsPage` consumed `AgentAvatarEditor`; both and
their page-only tests/fixture surfaces are deleted. Shared participants state,
API, `useOpenAgent`, member profiles/avatars, chat and teacher-agent capabilities
are retained. No server, runtime, model, membership or data change is included.

Retired links now enter the existing invalid-view fallback to conversations.
The same workspace authorization and unavailable-workspace empty state run
before `replaceState` canonicalizes the URL. There is no new redirect loop,
replacement management page or compatibility flag.

Focused navigation tests were written first (two baseline failures), then passed:

```sh
node --import tsx --experimental-test-module-mocks --test src/lib/webNavigation.test.ts src/lib/navigation.test.ts src/features/learning/dashboard/navigation.test.ts src/features/agents/state.test.ts
```

**8 tests passed**. These cover workspace authorization, denied/deleted/missing
workspaces, old links, URL replacement and simulated history back, generic invalid
views and retained participant avatar state. Changed source lint and whitespace
checks passed. `npm run build` (including web typecheck) passed before the clean
rebase onto main `6316eb88`; all 17 task files were byte-identical across rebase.
Main's adjacent #482 page styles are outside this navigation change.

The whole E2E typecheck was attempted and failed in unchanged
`react-delivery/recovery.e2e.ts`, `server/homework-presentation.ts` and harness alias
resolution. Those errors are not attributed to this change and were not repaired.
No browser E2E, live Agent run or independent review was performed. Existing E2E
navigation/visual selectors were updated for the retired page; the dedicated
page-only Agent actions suite was removed. This is source/build and synthetic
route acceptance, not production acceptance.

Prepared as a separate draft PR so #470/#472 can integrate independently. Only
the designated sole release environment may merge/deploy. No production writes.
