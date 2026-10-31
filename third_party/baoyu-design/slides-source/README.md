# Reconstructed Slides source

Derived from [JimLiu/baoyu-design c15e76ef5134228d2bb5da35652d30d7d6b8a34d](https://github.com/JimLiu/baoyu-design/tree/c15e76ef5134228d2bb5da35652d30d7d6b8a34d), MIT; see `../LICENSE` and both third-party license files. The complete original distribution and its manifest remain alongside this directory.

The published browser editor is minified, but `skills/claude-slides/scripts/editor/node/compiler.cjs` contains the full named application module factories. Those implementations were recovered into 321 separately named modules with their original function names, runtime exports and initializer order. `source-map.json` records each original factory's line in that pinned compiler. It is a provenance map, not a JavaScript source-map file. Browser dependency bindings and the original host comments bridge were recovered from the browser distribution. This is recovered distribution source, not a claim to possess BaoCut's original unpublished TypeScript repository.

The user's later instruction removes all video features. Seventeen video modules and the encoder worker were removed from executable source. Their names remain in `removedModules`; 304 application modules remain. Playback, provider embeds/thumbnails, insertion, drag/paste/upload and video export paths are removed. Pure legacy metadata parsing/serialization remains so opening and saving an old deck does not erase its fields; it renders a static unsupported-media placeholder. The unchanged archival distribution still contains its original video code because the issue requires the complete published source archive.

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

The browser output uses hashed shared assets; exports, PPTX and WOFF2 are lazy chunks. Browser and Node bundles can be rebuilt entirely from this directory. `scripts/slides-editor.test.mjs` checks that all browser inputs come from this directory, verifies complete archived file hashes and compares old-format compilation with the pinned implementation (including passive legacy media fields).

## Native differences

Chinese interface copy (the pinned translation catalog is the translation evidence); dialog sheet dependency initialization; native selection/context heartbeat and presentation-exit bridge; `__frame_claude_activity` for the existing comment agent presence; extra PDF/HTML/PPTX download formats enabled; export modules loaded on demand; video removal described above. Document content, keys and enum values are not translated.

The runtime `value`, `value2`, etc. locals come from recovered emitted source. Functional names and module boundaries make changes reviewable; recovering original variable names or original TypeScript types is not claimed. See `docs/evidence/issue-601/README.md` for the capability matrix and the real-browser verification limits.
