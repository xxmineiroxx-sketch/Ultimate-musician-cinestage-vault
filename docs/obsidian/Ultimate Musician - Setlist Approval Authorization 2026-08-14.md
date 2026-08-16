# Ultimate Musician - Setlist Approval Authorization (2026-08-14)

`handleApproveSetlist` and `handleRejectSetlist` performed **no caller check at all**.
Any caller could publish or reject any pending setlist — including the vocal leader who
submitted it. Approval is the control that makes setlist delegation safe, so it was the
one step that had to be enforced.

Related: [[Ultimate Musician - Setlist Approval Workflow]],
[[Ultimate Musician - Open Defects 2026-08-15]].

## The change

In `apps/ultimate_playback/cloudflare/ultimate-playback-sync/worker.js`:

- **`resolveActor(request, body, store)`** — identifies the caller. Prefers a session
  token (`tokenFromRequest` → `store.sessions[token]`, expiry-checked); falls back to a
  caller-supplied email (`body.actorEmail`, `x-actor-email`). Returns
  `{ email, verified, person, grant }`.
- **`isSetlistApproverRole`** — `org_owner`, `admin`, `manager` (worship leader).
- **`actorCanApproveSetlist(actor)`** — grant roles first, then person roles.

Both endpoints now return **401** without an identity and **403** for a non-approver.

`approvedBy` / `rejectedBy` are recorded from the **resolved actor**, not from a
caller-supplied field, so the audit trail cannot disagree with the permission that was
actually checked. `approvedByVerified` / `rejectedByVerified` record whether a token
backed the identity.

`AdminDashboardScreen.js` now sends `actorEmail` on approve and reject.

## Known limitation — authorization without authentication

No client sends session tokens yet, so the email fallback **stops the wrong app user
from acting, not a forged request**. When login plumbing lands, `verified` becomes true
and these same call sites enforce real authentication with no further change here.

## Verified

Against production: anonymous → 401; Vocal Lead → 403; unknown email → 403;
`worship_leader` grant and `org_owner` both pass to lookup.

Commit `2542ac1`. Worker deployed.

> [!warning] Sibling endpoint still unguarded
> `handleGrantRole` (same Worker) has no caller-identity check — anyone with the org key
> can grant themselves admin. Not yet patched. See
> [[Ultimate Musician - Open Defects 2026-08-15]].
