# OpenUI interactive lessons: retired

Issue [#193](https://github.com/LingXi-Org/LingxiLoop/issues/193) supersedes the experimental OpenUI implementation from issue #111. The active replacement is documented in [Visualize in LingxiLoop Web](visualize.md). Its fixed upstream skill and Gen UI source use HTML fragments and completed `::visualize` references; there is no OpenUI dual mode, DSL conversion, or legacy interactive-message adapter.

The OpenUI-specific renderer, catalog/schema, generation/projection path, state/action routes, dedicated dependencies and experimental test entrypoints are retired by this change. Shared conversation authorization, durable IM delivery, questionnaires, runtime ledger and unrelated features remain their existing owners.

Historical evidence remains under [`artifacts/interactive-ui`](../artifacts/interactive-ui), including previous failed, skipped and disabled-mode results. The [issue #111 M0 ADR](adr/issue-111-openui-m0.md) is retained as a superseded historical record; its old commands and dependency decisions are not current setup instructions or acceptance for Visualize.

Existing OpenUI data is retained. The committed `0033_interactive_ui.sql` migration is unchanged; additive `0046_visualize.sql` creates replacement tables without dropping or converting legacy `im_ui_*` rows. This source change does not imply that migration 0046 has been applied to any environment or that production has been deployed.

Current checks and evidence limits are listed in [the Visualize documentation](visualize.md#repeatable-checks-and-evidence-boundaries) and [issue #193 acceptance](evidence/issue-193/ACCEPTANCE.md). Historical OpenUI results do not establish that the new visual, security or real-model E2E gates have passed.
