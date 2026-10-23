# Public plan identity: failure model before implementation

- One explicit plan ID within one run/request is updated in later model attempts or recovered lease fences. Its UI identity and initial position must stay stable.
- Different explicit plan IDs, runs, or request versions remain different even when all text is identical. Explanations are still attempt-scoped; do not merge them like plans.
- Transport replay/order, delayed completion, or old lease events must not replace the newest accepted plan. Compare recorded fence/event sequence, never maximum progress or similar wording.
- A newer explicit revision can correct the progress count downward; do not hide that real update by selecting the maximum activeIndex.
- Completion/cancellation/failure must preserve the last reported plan accurately, without marking unfinished steps complete. Failed report calls stay visible as failures.
- Live snapshots, bounded history pages, and reconnect replay must expose one matching plan identity and latest props. A late stale page must not revive the old progress card.
- Full durable tool receipts remain intact. This is a display projection change, not a tool-call deletion, fee change, runtime policy/budget change, or migration.

All fixtures use synthetic data and the published LingxiOS API. No production conversation reads or model calls are required.
