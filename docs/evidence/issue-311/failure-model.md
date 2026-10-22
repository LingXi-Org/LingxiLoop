# Forum submission failure model

- Missing content or a mandatory own course conversation must explain what to do; no POST without both. Keep #146 server authorization and frozen evidence unchanged.
- Loading/polling submission history must not lock editing, uploading, reference selection or submission. History failure must have its own retry, not masquerade as submission failure.
- Conversation list/message errors must expose retry and preserve the answer, uploaded attachments and selected references. An empty list, an unselected conversation, and a conversation without a complete turn need distinct guidance.
- Room/message pagination and refresh must discard stale results after course/channel changes or unmount, including stale errors. A hung read must terminate and allow retry.
- Upload in progress must block submission with visible status. Upload failure must retain the draft and successful attachments and permit retry.
- Failed submission must retain content, attachments, references and the same idempotency key for an unchanged retry; success alone clears them. Double submission must not race.
- An old successful submission after leaving must not clear a reopened and already saved new draft.
- Browser regressions mount the actual ForumSubmission and ConversationReferencePicker with synthetic HTTP, using tester-army/e2e and @e2e-dev/web. They are not an original private production-case replay or provider/DB integration proof.
