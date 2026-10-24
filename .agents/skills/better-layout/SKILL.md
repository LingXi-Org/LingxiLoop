---
name: better-layout
description: Structure or review responsive web layout, spacing, hierarchy, alignment, RTL, and clipping.
---

# Layout

Use the project's styling system and existing tokens. Preserve DOM reading order, keyboard access, visible focus, and readable contrast.

- Group with space before separators; align related content to shared edges.
- Use logical CSS properties for direction-dependent layout. Let text wrap and translated labels grow.
- Pick breakpoints where content stops fitting; prefer component container queries when the component owns the adaptation.
- Keep critical actions visible through resize, scrolling, and safe areas.
- For learning/chat surfaces, use [the surface and interaction contract](references/learning-surfaces.md) with its code examples and observable checks.

For a review, report only actionable issues with severity, location, user impact, and the smallest fix.
