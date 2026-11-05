# Isolated native editor UI diagnostic

`scripts/native-editor-ui-acceptance.mjs` mounts the real React editor and its
Workers in StrictMode. A deterministic HTTP fixture uses the shared operation
reducer and checks synthetic tenant headers on image requests. This does not
verify real authentication, database durability, Agent runtime execution, export
fidelity or performance thresholds.

With repository dependencies, Chromium and a separately available Playwright
package installed, run:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
node --import tsx scripts/native-editor-ui-acceptance.mjs \
  --mode=both --browser=/absolute/path/to/chromium --output=/tmp/lingxi-native-ui
```

`--mode=slides` and `--mode=design` run either mode separately. If Playwright is
resolvable normally, omit `PLAYWRIGHT_MODULE`; if its bundled Chromium is
installed, omit `--browser`. The script starts a loopback Vite server in a
temporary directory and closes the server/browser on completion or failure.

`--checks=cas --mode=both` runs the active-editor double-click regression for
rich text and table cells in both modes. After the editor context confirms a
remote same-field revision, a second real double click selects text in the
still-active local editor. Typing and Ctrl+S must retain the remote value, enter
conflict, submit no stale mutation, and download a recovery containing the exact
local draft with its original version 0 (remote version 1). The report stores
only these outcomes; the temporary synthetic recovery file is removed with the
harness. This is a shared-reducer UI diagnostic, not a real Agent/API test.

The runner visits all 50 pages through navigation buttons, waits for each active
page's decoded image and formula, and checks bounded page DOM. It edits and
reopens pages 1, 25 and 50; page 1 uses Chinese composition with two 800 ms pauses
that must produce no save before confirmation. The three text edits must produce three
shared operation batches. Formula editing on page 25, image cropping on page 50,
theme switching and page ordering add six further manual batches. The runner
checks shared undo/redo for ordering and the Agent batch, reopens the edits, and
compares all page payload SHA-256 hashes: only pages 1, 25 and 50 may change. Merely opening text must not create an undo entry.
It also applies a plain-text Agent-style operation through the shared reducer
and waits for the editor to refresh, then presents and clicks page 25's isolated
iframe image while checking its sandbox attribute.

The output contains a compact JSON result and screenshot for each mode. The
recorded runs are linked from [isolated-ui-smoke.json](isolated-ui-smoke.json).
Chromium CDP emits trusted composition start/update/input events but an untrusted
composition-end event; this also occurs in a plain `contenteditable` control.
[isolated-ime-events.json](isolated-ime-events.json) records that distinction.
Native OS candidate windows and other browser/OS input methods remain untested.

Use `--checks=save` for the short save-control regression. It holds transport
acknowledgments while editing focused title, width, notes and table controls,
checks `draft` → `pending` → `saved`, and verifies Ctrl+S does not submit a
Chinese composition. It also checks an unrelated Agent color change survives a
font-size edit, shared Ctrl+Z/Ctrl+Y works inside the rich-text editor, and Design
board X/Y edits persist. [Slides](isolated-save-slides.json) and
[Design](isolated-save-design.json) record those outcomes. Per-editor registry
tests cover draft/flush isolation without adding drafts to document history.
