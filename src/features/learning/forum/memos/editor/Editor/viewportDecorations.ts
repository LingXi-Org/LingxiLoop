/* Adapted from usememos/memos components/MemoEditor/Editor/viewportDecorations.ts at 8120a6c (MIT). See ../../README.md. */
import { syntaxTree } from "@codemirror/language";
import { type DecorationSet, type EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

/**
 * A ViewPlugin that maintains viewport-scoped decorations, rebuilding when the
 * document or viewport changes. Shared by the tag/mention and heading
 * decoration plugins, which differ only in their `build` function.
 */
export function viewportDecorations(build: (view: EditorView) => DecorationSet) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) {
          this.decorations = build(u.view);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
}
