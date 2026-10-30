# Learning surfaces and controls

Use the existing semantic variables, density and primitives. Each acceptance is
an observable scenario to run; this guide does not imply it already passed.

| Rule and code | Correct example | Observable acceptance |
| --- | --- | --- |
| Use `src/styles/globals.css` surface tokens: app, panel, raised, inset and hairline; preserve the green brand and foreground tokens. | Put reading content on panel, controls on raised/inset, and group related actions with space. | Compare the same conversation, approval, editor/list and artifact in light/dark; check text contrast, one useful boundary and visible focus. |
| Use shared density variables from `globals.css`/`chat.css` according to task. | Comfortable student derivation; compact teacher queue. | Resize each real container and increase text size; long Chinese labels wrap and primary actions remain reachable. |
| Preserve existing radius/button/focus/motion primitives. Use tabular digits for changing counts. | A state transition gives a brief reduced-motion-aware update without moving the student's selection. | Enable reduced motion, tab through controls and observe state/expand transitions; focus stays visible. |
| Use `src/components/ui/resizable.tsx` (`react-resizable-panels`) for split panes. | The keyboard separator adjusts a learning pane while the artifact retains its DOM/state. | Arrow keys change aria-valuenow; drag across the iframe and release, then operate the iframe. Installed 4.12.3 already disables panel pointer events during active dragging; inspect that API before adding another shield/controller. |
| Let artifact type owners manage preview/focus: `GenUiCard.tsx`, `ImageViewer.tsx`, ArtifactEditorFrame. | Closing an expanded view returns focus to its opener; switching to the authored original preserves tweaks. | Expand/collapse repeatedly, open/cancel a question, zoom an image and compare versions. Check focus, same retained guest and current state in a narrow pane. |

The current GenUI styling has its own scoped upstream adaptation documented in
`src/features/chat/visualize/ADAPTATIONS.md`; preserve that isolation when applying
host theme rules. Source/functional evidence is distinct from pixel parity and
production acceptance. See the [learning interaction guide](../../assistant-ui/references/learning-experience.md)
for request identity and pedagogy.
