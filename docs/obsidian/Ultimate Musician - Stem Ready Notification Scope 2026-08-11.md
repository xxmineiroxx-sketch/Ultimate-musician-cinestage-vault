# Ultimate Musician - Stem Ready Notification Scope (2026-08-11)

Publishing a stem job messaged the **whole assigned team**, so every musician's inbox
filled with pipeline status for every song. Stem completion is an operational notice:
admins, worship leaders and music directors need it so they know processing finished;
players do not.

Related: [[Ultimate Playback - Stem Delivery Fix 2026-08-09]],
[[Ultimate Musician - CineStage Desktop Stem Worker]].

## The change

`handlePublishStemJob` in `apps/ultimate_playback/cloudflare/ultimate-playback-sync/worker.js`
used `teamMessageRecipients(plan.team)`. It now uses a new `leadershipRecipients(store)`:

- Reads `store.grants` first — the authoritative permission record — via the existing
  `isElevatedGrantRole` predicate (checks `role`, `grantedRole`, `orgRole`).
- Falls back to person roles (`personRoleKeys`) so an org that has not issued grants
  still notifies its leadership.

The message is addressed `to: 'leadership'` and now reports **how many team members the
stems reached** instead of telling the reader to go practice:

> CineStage stems finished processing for "…".
> They are now available to the N assigned team members in Playback.

## Verified

Against production data: 3 leaders notified (2 `org_owner`, 1 `worship_leader` grant);
ordinary players no longer receive it.

Commit `69497cb`. Worker deployed.

> [!note] Why grants come first
> Person roles are display metadata and drift. A grant is the record that actually
> gates permission elsewhere in the Worker, so notification scope and permission
> scope now read from the same source.
