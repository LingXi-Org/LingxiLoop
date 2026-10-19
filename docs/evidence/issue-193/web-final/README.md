# Final independent upstream Web presentation

Official runner: 4/4 scenarios passed. Original and product light/dark card, default controls and expanded dialog produce 6/6 exact RGBA matches: zero differing pixels, no masks, resizing or threshold. Each image is 1440×960 at DPR1.

The baseline imports immutable original components, primitives, class-merging utility, full original styles.css and applyTheme. Product CSS compiles separately. Both use original cold-start Web theme semantics (Zai light/dark classes, semantic foreground, native color scheme and Inter font), a fixed equal outer canvas, identical fixture HTML/JS and shared Web platform host transport. Source/fixture hashes are in manifest.json. This validates presentation; it does not claim Electron execution or replace backend authorization and real-model coverage.

*-interaction.json records the actual computed fonts, color scheme, theme classes and component styles. pairs.json and diff/diff-report.json give replayable screenshot paths and hashes. Earlier failures and the incomplete pre-theme baseline are retained separately.
