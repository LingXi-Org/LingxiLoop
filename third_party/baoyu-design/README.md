# Retained baoyu-design design resources

Source: [JimLiu/baoyu-design v2.8.0, commit 016b39d7fdcc30bfacee31ea5541498ac53921c6](https://github.com/JimLiu/baoyu-design/tree/016b39d7fdcc30bfacee31ea5541498ac53921c6), MIT; see [LICENSE](LICENSE).

This directory retains design rules, format specifications, theme tokens, static
examples and attribution used by LingxiLoop's native React/TypeScript editor.
It is deliberately a resource subset, not a complete executable upstream archive.
`retained-manifest.json` records the reviewed byte count and SHA-256 of every
retained resource. Original upstream history remains available at the source URL
and in repository history.

The former Design/Slides editor applications, recovered module runtime, Node
compiler, bundled React copies, build patches and duplicate archived editor
implementations have been removed. No production build serves those programs.
The native document model, operation service, compatibility converter and export
adapters own editing and format support independently.

## Themes and provenance

- `host/slides-builtin-style.json` preserves the source-derived Claude color/type
  tokens and style extracted from the pinned Slides distribution. It was moved
  byte-for-byte from the retired source directory. It is not a separately
  published official Claude design-system package.
- `host/builtin-themes.json` preserves Ember and Seazar, including variant tokens
  and their source pointers. Their original design-system examples remain under
  `distribution/skills/claude-design-system/artifact-type/`.
- `upstream/claude-design/` and `upstream/claude-slides/` retain the upstream skill
  text and format/design references. Host Agent instructions adapt their authoring
  protocol to native versioned operations; these documents do not load an editor.

Legacy document bytes belong to product storage, not this source directory.
Conversion preserves their original immutable hashes and writes a new native
representation. Unsupported executable content continues to use isolated
previews; importing a document never executes its source.

Run `node --test scripts/native-artifact-retirement.test.mjs` to verify the resource
inventory and packaging boundary. Performance and product acceptance belong to
the native 50-page checks, not the retired bundle-build tests.
