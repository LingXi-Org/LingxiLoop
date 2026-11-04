# Retired interactive message implementations

The experimental OpenUI implementation (#111) and its Visualize successor (#193)
are retired. Issue #670 unifies new visual explanations under the editable Design
canvas. No OpenUI/Visualize executable renderer or tool is registered.

Historical message bodies and persistent data remain. See
[historical Visualize recovery](visualize.md) for the permission-checked inert
JSON archive and its migration limits. Existing `0033_interactive_ui.sql` and
`0046_visualize.sql` migrations remain unchanged; retirement never erases or
converts user work silently.

Old evidence in Git history documents old versions and is not current setup,
validation or release guidance. Current production release checks remain in
[RELEASE.md](RELEASE.md).
