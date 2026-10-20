# #247 bounded numeric rendering — before implementation

Base: 0767185956086a760c322ed4ac4eaf59eff0cb0c. Preserve PR243 and all historical/provider red outputs. This slice addresses supported numeric chart construction, not universal arithmetic reasoning or proof that a model will choose a visualization. No paid/browser rerun.

Failure inventory:

- Plot, annotations, table, recommendations and returned calculations use independent numbers or reversed comparison branches. Intersections need both coordinates from the same supplied functions; parallel/coincident lines must not divide by zero. Recommendations must use unrounded values, including ties and threshold sides.
- A derived series subtracts a different series' prior value. Absolute changes and percentage changes are confused; zero/negative denominators invent finite growth rates; decreasing periods or tied maxima disappear.
- Missing/duplicate periods, series labels, references or samples make data ambiguous. Unequal series lengths, invalid ranges, NaN/Infinity, overflow or excessive result magnitudes enter SVG coordinates or summary output. Bound size and magnitudes; reject unsafe results before persistence. Round only visible formatting, never calculations/decisions.
- Untrusted title, series, labels and units escape HTML/SVG context via quotes, tags, closing script tags, URLs or entities. Generate text/attributes with escaping only; no model expressions, scripts, href, external resources, eval or HTML interpolation. Renderer is static SVG+table, not a generic chart framework.
- Cancellation, parse or computation errors cause a save or overwrite. Check cancellation before computation and persistence; route successful output through the existing fragment constraint, tenant/conversation/current-user/run-binding authorization and native transaction tool path. Do not turn authorization/storage failures into input success.
- New tool is absent from the public skill/tool registry, or breaks ordinary save/read/export/reference and code-example behavior. Add an opt-in public action; never infer mandatory activation from keywords or private runtime receipts.
- Tests replace the original red artifacts, hardcode the two problem answers in production, force child exit, or count skipped provider tests as quality passes. Use independent arithmetic and varied inputs; retain scope limitations.

Checks are authored first: pure renderer arithmetic/boundaries/injection/cancellation; focused public tool registration and no-write admission behavior; owning server lint/typecheck. Historical outputs and formal runtime/locks/migrations/client/visual E2E files remain unchanged. A trusted public skill-activation/delivery-obligation interface remains a separate upstream gap.

Independent review found a cancellation-sensitive intersection residual: `1000+1000*x` and `x` near x=-1000/999 differ by about1e-13 after floating-point evaluation. Comparing residual only to the small final y falsely rejects supported inputs. Before changing the guard, retain this counterexample and scale its tolerance by the original multiply/add operands; this does not loosen input/result magnitude limits or round comparisons.

Independent review also identified two suite-integration failures before correction: the exact public registry expectation lacks the new action, and the new database test incorrectly requires one local database name rather than the runner's dedicated-test naming policy. Preserve the registry uniqueness check, align the dedicated database guard with the existing runner and use unique fixture identities for repeatable local execution.
