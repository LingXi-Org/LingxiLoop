# Native editor parity — issue 707

Reference: JimLiu/baoyu-design v2.8.0, `016b39d7fdcc30bfacee31ea5541498ac53921c6`.
Performance baseline: LingxiLoop `72162f582fe49e9cbdb03f760e29e3683f9c5c99`.

`source-inventory.json` pins the inspected JS/CSS/entry/font bytes and locates
reference feature symbols in the compressed distributions. Reference executable
files live only in the temporary analysis environment. They are not shipped.
The upstream NOTICE separates MIT local tooling from the reconstructed Anthropic
editors and icon fonts; the implementation uses the product's React runtime,
existing components and Lucide icons.

## Delivery boundary

Editor content is Chinese, with LingxiLoop identity. The surrounding workspace
is unchanged. Comments and Agent use existing product services. Public sharing,
LAN links and phone remotes have no native product service and have no controls,
placeholder components, unavailable labels or event handlers in the new UI.
Read-only and empty-selection states of supported editing controls remain valid.

## Checks and evidence

Record only commands actually executed against the candidate. The isolated UI
runner exercises real React, the shared reducer and Workers with a controlled
HTTP fixture; it does **not** qualify product authentication, PostgreSQL
persistence, actual Agent execution or full-product performance.

The cloud environment's `npm ci --ignore-scripts` failed with E401 downloading
`@lingxi-org/lingxios@4.0.0` from GitHub Packages. The frontend-only validation
installation is in `/tmp/lingxi-public-validation`: it uses the repository's
lockfile and omits only that inaccessible private dependency. No replacement
runtime, ambient type shim or fake package is installed in its place. Full
web/server typechecks that reach that package remain blocked until the official
dependency can be installed.

### Reproducible local editor diagnostics

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node --import tsx \
  scripts/native-editor-ui-acceptance.mjs --mode=both --checks=parity \
  --browser=/path/to/chromium --output=/tmp/lingxi-parity
```

Use `--checks=save` for composition, focused Ctrl+S, pending ACK, concurrent style
changes and durable fixture reload. Omit `--checks` for the 50-page regression.
Screenshots alone do not establish the specified 1 px / 0.5% source parity gate.

## Completion gates

- [ ] Every source feature/state in the parity matrix is implemented and checked.
- [ ] Matched source/candidate screenshots pass 1 px / 0.5% thresholds in all four sizes and both themes.
- [ ] Final-candidate editor, model, media and comment checks pass.
- [ ] Authenticated API/Agent/database integration passes with the official runtime.
- [ ] Ten AB/BA pairs per editor meet ≤5% regression and input p95 ≤100 ms.
- [ ] Independent read-only review of the final candidate is complete.

No production merge or deployment is included.
