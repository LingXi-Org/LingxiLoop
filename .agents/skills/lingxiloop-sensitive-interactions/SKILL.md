---
name: lingxiloop-sensitive-interactions
description: "Implement, refactor, debug, or review LingxiLoop UI for destructive, irreversible, privileged, or approval-gated actions and for user-triggered task feedback. Use for delete, remove, revoke, leave, archive, suspend, role/tier/permission changes, account actions, approval cards, task dispatch, run-now actions, email sending, and similar mutations so confirmation always uses the shared Base UI Alert Dialog and lifecycle feedback always uses the shared Base UI Toast."
---

# Enforce LingxiLoop Sensitive Interactions

Treat confirmation and outcome feedback as part of the action contract.

## Confirm sensitive mutations

- Use `confirmSensitiveAction` from `@/lib/confirmAction` before every destructive, irreversible, privileged, or access-changing mutation.
- Use `promptSensitiveAction` when a sensitive action also collects a reason or note.
- Render confirmation only through the global `GlobalInteractionProvider` and `@/components/ui/alert-dialog` composition.
- Give the dialog a concrete title, consequence-focused description, explicit action label, and `tone: 'destructive'` for destructive actions.
- Await confirmation before setting busy state or calling the API. Cancellation must perform no mutation.
- Never use native `confirm()`, `window.confirm()`, `alert()`, or `prompt()` for a sensitive workflow.
- Do not substitute a nested context-menu item, inline confirmation block, popover, Sheet, Drawer, or ordinary Dialog for Alert Dialog.

Sensitive actions include deletion, removal, revocation, leaving a shared space, archive/suspend operations, account deletion, permission/role/tier changes, and actions with comparable consequences.

## Publish action outcomes

- Wrap user-triggered async mutations with `toastAction` from `@/lib/actionToast`.
- Supply localized loading, success, and error titles. Add a concise description when it identifies the affected resource or task.
- Use `notifyAction` for immediate status, warning, or validation feedback that has no promise lifecycle.
- Approval cards must Toast both approve and reject paths. Approval success copy must state whether the related task was triggered or blocked.
- User-triggered task dispatch, run-now actions, email sends, and requested event creation must expose loading, success, and error Toast states.
- Preserve inline field errors when they help correction; Toast remains required for the overall action outcome.
- Mount only the shared `Toaster` owned by `GlobalInteractionProvider`; do not create business-specific toast stacks.

## Preserve behavior

- Keep API/store calls, retries, focus, navigation, and authorization checks intact.
- Prevent double submission while a confirmation or task is pending.
- Keep sensitive actions keyboard accessible and ensure cancel is always available.
- Do not show a success Toast before the mutation promise resolves.

## Verify

- Update `src/lib/sensitiveInteractionIntegration.test.ts` when adding a new sensitive surface.
- Confirm production sources contain no native `confirm()` call.
- Test cancel, confirm, loading, success, and error paths for the changed action.
- Run `$lingxiloop-verify-change` and browser-check at least one Alert Dialog plus one Toast lifecycle.
