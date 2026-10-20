# Native paragraph assertion failure model

Frozen preparation commit 58e5036cdac569e39d3457863996878cff30f8b1 ran seven official-browser cases: six passed and the 14-block case failed before bold typing with LOCATOR_AMBIGUOUS (five paragraphs). The global paragraph locator does not identify the editor selection whose Control+Alt+0 conversion is under test. Preserve the original report and trace.

Correction must inspect the actual DOM selection within the labelled native editor and assert its nearest block content is paragraph. It must fail if selection leaves the editor, is absent, or stays in another block type. It must not pick an arbitrary first paragraph, inject editor state, remove original block insertions or weaken visible-bold and persisted-bold assertions. Use the existing official expect.poll for the observable selection state; no whole-test retries, sleeps, skips or replacement native controls.
