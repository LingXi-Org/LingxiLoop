# Reconstructed Slides source

Derived from [JimLiu/baoyu-design 016b39d7fdcc30bfacee31ea5541498ac53921c6](https://github.com/JimLiu/baoyu-design/tree/016b39d7fdcc30bfacee31ea5541498ac53921c6), MIT; see `../LICENSE` and both third-party license files. The complete original distribution and its manifest remain alongside this directory.

The published browser editor is minified, but `skills/claude-slides/scripts/editor/node/compiler.cjs` contains the full named application module factories. Those implementations were recovered into 332 separately named modules with their original function names, runtime exports and initializer order. `source-map.json` records each original factory's line in that pinned compiler. It is a provenance map, not a JavaScript source-map file. Browser dependency bindings and the original host comments bridge were recovered from the browser distribution. This is recovered distribution source, not a claim to possess BaoCut's original unpublished TypeScript repository.

The user's later instruction removes all video features. Nineteen video modules and the encoder worker were removed from executable source. Their names remain in `removedModules`; 313 application modules remain. Playback, provider embeds/thumbnails, insertion, drag/paste/upload and video export paths are removed. Pure legacy metadata parsing/serialization remains so opening and saving an old deck does not erase its fields; it renders a static unsupported-media placeholder. The unchanged archival distribution still contains its original video code because the issue requires the complete published source archive.

The browser dependency bindings retain their recovered local names. For v2.8.0,
the React/Base UI/utility prefix was compared to the new browser bundle using
TypeScript AST leaves with local identifier/shorthand normalization: 255,006
tokens match outside the deliberately retained FieldsetRoot in place of the
new Form implementation. Native PDF confirmation uses a button callback in the
sandbox, rather than upstream form submission/field validation. The native
comments/host bridge remains the adapted v2.1.0 bridge; sharing, role, history
and presence server protocols are not imported. The PPTX/ZIP segment matches
95,048 normalized tokens after applying v2.8.0's paragraph font-face fix;
the WOFF2 decoder is unchanged except the upstream bundle import filename.
This preserves library semantics without unrelated minified-symbol churn.
Route handling and validation: `docs/evidence/issue-648/README.md`.

## Build and maintenance

```
npm ci
npm run build:slides-editor
node --test scripts/slides-editor.test.mjs
```

Use the repository's exact published SDK dependency and normal package credentials. The source-only editor checks need public esbuild/TypeScript dependencies; they do not validate SDK integration.

- `main.js` creates the runtime and attaches `workspace-bridge.js`.
- `runtime.js` installs all live getters before running factories. Preserve that ordering: factories have cyclic dependencies. It lazily imports `exports.js` on the first export.
- `modules/` owns the editor, model/schema/serialization, compiler, design systems, editing gestures, accessibility, comments, presentation and exports. Edit the owning named module directly. No build-time regex patch of the minified editor is involved.
- `support.js` and `modules/dependencies-e4.js` adapt the pinned React/Base UI/browser dependencies and host comments integration. Third-party library internals retain upstream minified names.
- `vendor/` contains the pinned dependency implementations (PPTX, WOFF2, Node compiler dependencies), with the upstream license inventory; these are libraries, not an editor bundle hidden behind a wrapper.
- `node/compiler.js` uses the same named application modules and the Node dependency bindings. `check.ts` selects its generated compiler via `BAOCUT_SLIDES_EDITOR_DIST`.
- `index.html`, `editor.css` and the icon font are source inputs. Generated output is under ignored `server/assets/slides-editor/`. The build deletes obsolete generated chunks before writing its output.

The browser build prunes statically unread private runtime getters (including consumers in lazy exports and the workspace bridge). It retains every initializer and the Node compiler namespace; computed runtime reads stop the build for explicit handling. This only enables normal dead-code elimination, not removal of editing features.

The build writes Brotli quality-11 and gzip level-9 sidecars for JavaScript/CSS.
The asset endpoint negotiates these stored representations, with `Vary:
Accept-Encoding` and an identity fallback. Compression is paid at build time.
The full embedded fallback icon font is extracted unchanged to a hashed WOFF2
asset; CSS is hashed too. Browsers load that face only when a glyph needs it.
Constant `slides:*` performance marks expose runtime initialization, access and
file boot, render request, first-slide paint and complete-document readiness.
They contain no document data and do not change the editable-readiness metric.

The browser output uses hashed shared assets; exports, PPTX and WOFF2 are lazy chunks. Browser and Node bundles can be rebuilt entirely from this directory. `scripts/slides-editor.test.mjs` checks that all browser inputs come from this directory, verifies complete archived file hashes and compares old-format compilation with the pinned implementation (including passive legacy media fields).

## Native differences

Chinese interface copy (the pinned translation catalog is the translation evidence); dialog sheet dependency initialization; native selection/context heartbeat and presentation-exit bridge; `__frame_claude_activity` for the existing comment agent presence; extra PDF/HTML/PPTX download formats enabled; export modules loaded on demand; video removal described above. PDF confirmation uses an explicit button callback because the product sandbox does not permit form submission. Document content, keys and enum values are not translated.

Slides read-only text and table cells render explicitly delimited TeX through
the root-locked KaTeX 0.16.47 (`math.js`); the pinned auto-render delimiter splitter
owns delimiter/brace matching. Editing and persisted HTML retain the original
source, marks and format. Backtick and monospace code, amounts and invalid TeX
stay readable as text. The build supplies content-addressed local WOFF2 fonts;
HTML/PDF capture includes those faces. Display formulas wrap at KaTeX's legal
breaks; indivisible formulas fit the available content width. Existing vertical
text-fit rules still apply. Native PPTX cannot represent this layout: formula
pages use the existing PNG capture, keep speaker notes and report the picture
fallback; other pages keep native text. Reproduction, syntax and boundaries are
in `docs/evidence/issue-631/README.md`.

`builtin-style.json` is a static Slides resource assembled from this pinned
distribution's `namedSlideColors`, `anthropicTypeScale` and the documented
Georgia/system font fallbacks. It is not the missing `artifact-type/demo.html`
or a reconstruction of the screenshot's unpublished deck. New product decks
receive its tokens and existing-format look memory at creation only. Template
restyling consumes the active saved memory before typography can be inferred,
and fills absent roles without replacing observed document typography. The
archival templates and old decks without look memory retain their defaults.
No Design System skill or runtime is introduced. Source
mapping, actual export samples and limits: `docs/evidence/issue-621/README.md`.

The runtime `value`, `value2`, etc. locals come from recovered emitted source. Functional names and module boundaries make changes reviewable; recovering original variable names or original TypeScript types is not claimed. See `docs/evidence/issue-601/README.md` for the capability matrix and the real-browser verification limits.
