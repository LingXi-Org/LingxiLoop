# Explicit course teacher assignment

Synthetic UI cases written before implementation. Original private account/course identifiers are unavailable; these cases do not claim reproduction of that account.

- A company teacher identity is mistaken for membership in every course. Show company identity and exact course assignment separately; never assign without an explicit course/teacher selection.
- A teacher missing from the course list has no path back after identity conversion. Let company administrators explicitly add an existing company teacher to this course, using the existing protected assignment operation.
- Ordinary teachers/students fetch the administrator-only company directory. Hide the assignment control and never call the directory for unauthorized viewers.
- The selected course or teacher is stale, from another company, or already enrolled. Only present eligible options from the current authorized scope; backend remains the authority.
- Options fail to load. Show an actionable error and retry, with submission disabled until a current selection is available.
- Assignment fails or the acknowledgment succeeds but membership readback fails. Keep the dialog and selection, report the failure, reuse the same idempotency key, and do not announce success until readback confirms the exact teacher in the selected course.
- Scope change or dialog closure admits a late options response. Cancel its state update on unmount; keyed callers bind the form to the course/target.
- A successful assignment from course A arrives after navigation to B, overwrites B's list or closes B's new dialog. Guard the parent readback update by mounted scope and guard dialog completion after unmount.
- Course assignment incorrectly reuses the ACTIVE-only student promotion condition. A company administrator may explicitly add a teacher to a DRAFT course when its member capability allows it; READ_ONLY courses must never offer this action.
- Refresh loses the visible membership. Refetch owning data after assignment and verify it after a browser reload.
- Promotion unintentionally restores old course permissions. Preserve the existing identity transition; explain that adding to a course is a separate explicit operation.

Official @e2e-dev/web browser cases use only local synthetic fetch responses and real product components; server tests separately cover actual ACL and persistence.
