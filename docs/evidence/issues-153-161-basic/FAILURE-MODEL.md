# Short basic acceptance failure model

Written before the new process fixture. Scope: #153/#161 on current main,
exact published LingxiOS 3.5.5, disposable local PG/Redis, deterministic model
and recording IM HTTP server. No live provider, production injection or soak.

- Wrong Worker role starts API maintenance/listeners; failed admission leaks
  connections. Reuse the existing real PG/Redis startup regressions.
- Required dependency outage or saturated pool leaves traffic ready; concurrent
  probes amplify pending IO. Reuse the foundation HTTP regression, explicitly
  labelled foundation-only because its historical 3.4.7 gate is immutable.
- Worker dies after a successful native chat write and atomic result commit but
  before receiving the result acknowledgement. A replacement must preserve the
  same result, action ledger and send acceptances without replaying model/tools.
- Control connection is briefly unavailable before replacement claims. A pending
  human request must remain queued and resume only after the connection returns.
- Terminal notification acknowledgement is lost after acceptance, then the control service is stopped and
  recreated. The original terminal feedback identity/status must survive; delivery
  eventually converges once, with no agent wake and no fabricated result.
- An old failed/cancelled turn blocks a later request. A fresh human message must
  complete after recovery. Reuse cancellation/revocation/bounded deadline tests.
- Test fixture targets a non-disposable database or leaks children/sockets. Use
  the existing integration target guard, explicit child ownership and finally
  teardown; retain sanitized counts and exact source/runtime identity.

Long soak, production load profiling, real provider/billing, full SPA and the
production container sandbox are outside this short acceptance. They must never
be inferred from this fixture. Existing fixed 3.5.3 soak and automation stay untouched.
