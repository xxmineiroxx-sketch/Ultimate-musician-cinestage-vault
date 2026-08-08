# Ultimate DAW Desktop Role Access

Date: August 8, 2026

## Decision

Ultimate DAW Desktop is restricted to leadership accounts only:

- Org Owner
- Admin
- Worship Leader

Music Director, Lead Singer, setlist creators, musicians, vocals, and volunteers should use Ultimate Playback unless they also have one of the desktop access roles above.

## Enforcement

- Desktop login checks `/sync/desktop/access` after password authentication.
- Saved desktop sessions re-check the live role grant on app startup.
- Active desktop sessions re-check the live grant every 60 seconds.
- If the role is removed, the desktop session is cleared and the user is returned to sign in.

## Backend Rule

The sync Worker treats explicit grant records as authoritative. If a user is set to `none`, that blocks stale user/profile role fields from keeping desktop access alive.

Live Worker version:

- `2.4.7-desktop-role-gate`
